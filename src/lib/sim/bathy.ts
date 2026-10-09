/**
 * Bathymetry modelled from a coastline polyline (no survey data).
 *
 * The J-Bay recipe from the reference solver (`surf-sim/solver/bathymetry.py`),
 * generalised to any coast, any grid placement and per-spot overrides:
 *
 *   s = signed distance to the coast (m), positive seaward
 *   s <= 0          land, elevation rises at `landSlope` (depth stored negative)
 *   0 < s <= W      shelf, depth = s * shelfSlope
 *   s > W           ramp,  depth = W * shelfSlope + (s - W) * rampSlope
 *
 * Frame and sign conventions are in FRAME.md. In short: coast polylines are
 * ENU metres (x east, y north) with the ocean on the RIGHT when walking the
 * polyline in vertex order (the OpenStreetMap coastline convention).
 */

export type Vec2 = [number, number];
export type Polyline = Vec2[];

/** Solver grid placed in the ENU frame. See FRAME.md. */
export interface GridSpec {
	/** cells across shore (ix = 0 at the land side, ix = nx - 1 at the wavemaker) */
	nx: number;
	/** cells along shore */
	ny: number;
	/** cell size (m) */
	dx: number;
	/** ENU position (m) of the centre of cell (0, 0) */
	origin: Vec2;
	/** counter-clockwise angle (deg) from ENU east to the grid +ix axis */
	rotationDeg: number;
}

/** Optional sandbar: a Gaussian ridge parallel to the coast. */
export interface Sandbar {
	/** distance seaward of the coastline (m) */
	offset: number;
	/** how much the bar raises the bed (m) */
	height: number;
	/** Gaussian sigma across the bar (m) */
	width: number;
}

export interface BathyRecipe {
	/** land rise per metre inland (1:25 at J-Bay) */
	landSlope: number;
	/** depth gain per metre seaward on the shelf (1:25) */
	shelfSlope: number;
	/** shelf width (m) before the ramp starts (250) */
	shelfWidth: number;
	/** depth gain per metre seaward beyond the shelf (1:70) */
	rampSlope: number;
	/**
	 * Tilt (deg) of the shelf edge relative to the coast. Positive widens the
	 * shelf toward +along-coast (the direction of vertex order). 0 = isobaths
	 * parallel to the coast, as at J-Bay.
	 */
	reefAngleDeg: number;
	/** along-coast arc length (m) where the tilt pivots; default: the arc point nearest the grid centre */
	reefPivot?: number;
	sandbar: Sandbar | null;
	/** cap on wet depth (m) */
	maxDepth: number;
}

export type BathyOverrides = Partial<BathyRecipe>;

export const JBAY_RECIPE: BathyRecipe = {
	landSlope: 1 / 25,
	shelfSlope: 1 / 25,
	shelfWidth: 250,
	rampSlope: 1 / 70,
	reefAngleDeg: 0,
	sandbar: null,
	maxDepth: Infinity
};

export interface Bathy {
	/** still-water depth (m), > 0 wet, < 0 land elevation; idx = ix * ny + iy */
	depth: Float32Array;
	/** 1 = land (depth <= 0); same layout */
	land: Uint8Array;
	/** signed distance to the coast (m), positive seaward; same layout */
	s: Float32Array;
}

/** ENU position of the centre of cell (ix, iy). */
export function cellCentre(grid: GridSpec, ix: number, iy: number): Vec2 {
	const r = (grid.rotationDeg * Math.PI) / 180;
	const c = Math.cos(r);
	const sn = Math.sin(r);
	const u = ix * grid.dx;
	const v = iy * grid.dx;
	return [grid.origin[0] + u * c - v * sn, grid.origin[1] + u * sn + v * c];
}

interface Segments {
	ax: Float64Array;
	ay: Float64Array;
	bx: Float64Array;
	by: Float64Array;
	/** arc length at the segment start, measured along its own polyline */
	a0: Float64Array;
	n: number;
}

function flatten(coast: Polyline | Polyline[]): Segments {
	const lines: Polyline[] =
		coast.length > 0 && typeof (coast as Polyline)[0][0] === 'number'
			? [coast as Polyline]
			: (coast as Polyline[]);
	let n = 0;
	for (const l of lines) n += Math.max(0, l.length - 1);
	const seg: Segments = {
		ax: new Float64Array(n),
		ay: new Float64Array(n),
		bx: new Float64Array(n),
		by: new Float64Array(n),
		a0: new Float64Array(n),
		n
	};
	let k = 0;
	for (const l of lines) {
		let arc = 0;
		for (let i = 0; i + 1 < l.length; i++, k++) {
			seg.ax[k] = l[i][0];
			seg.ay[k] = l[i][1];
			seg.bx[k] = l[i + 1][0];
			seg.by[k] = l[i + 1][1];
			seg.a0[k] = arc;
			arc += Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]);
		}
	}
	return seg;
}

/** Squared distance from (px, py) to segment k and the clamped parameter t. */
function segDist2(seg: Segments, k: number, px: number, py: number, out: { d2: number; t: number }) {
	const abx = seg.bx[k] - seg.ax[k];
	const aby = seg.by[k] - seg.ay[k];
	const l2 = abx * abx + aby * aby;
	if (l2 < 1e-9) {
		out.d2 = Infinity;
		return;
	}
	const apx = px - seg.ax[k];
	const apy = py - seg.ay[k];
	let t = (apx * abx + apy * aby) / l2;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	const dx = apx - t * abx;
	const dy = apy - t * aby;
	out.d2 = dx * dx + dy * dy;
	out.t = t;
}

const LEAF = 8;

/**
 * Nearest-segment search over a coastline: a bounding-volume hierarchy with
 * branch-and-bound, so the cost per query grows with log(segments) rather than
 * the segment count. Ties go to the lowest segment index, the brute-force (and
 * reference) rule, so both searches return identical results.
 */
export class CoastIndex {
	readonly seg: Segments;
	private order: Int32Array;
	private box: Float64Array; // per node: minx, miny, maxx, maxy
	private kids: Int32Array; // per node: left, right (-1 for a leaf)
	private span: Int32Array; // per node: start, count into order
	private nodes = 0;
	private stack = new Int32Array(128);
	private tmp = { d2: 0, t: 0 };
	/** +1: ocean on the right of the direction of travel; -1: on the left */
	private side: number;

	constructor(coast: Polyline | Polyline[], oceanSide: 'left' | 'right' = 'right') {
		this.seg = flatten(coast);
		this.side = oceanSide === 'right' ? 1 : -1;
		const n = this.seg.n;
		this.order = new Int32Array(n);
		for (let i = 0; i < n; i++) this.order[i] = i;
		const maxNodes = 2 * n + 1;
		this.box = new Float64Array(maxNodes * 4);
		this.kids = new Int32Array(maxNodes * 2);
		this.span = new Int32Array(maxNodes * 2);
		if (n > 0) this.build(0, n);
	}

	private build(start: number, count: number): number {
		const node = this.nodes++;
		const { ax, ay, bx, by } = this.seg;
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (let i = start; i < start + count; i++) {
			const k = this.order[i];
			x0 = Math.min(x0, ax[k], bx[k]);
			y0 = Math.min(y0, ay[k], by[k]);
			x1 = Math.max(x1, ax[k], bx[k]);
			y1 = Math.max(y1, ay[k], by[k]);
		}
		this.box.set([x0, y0, x1, y1], node * 4);
		this.span[node * 2] = start;
		this.span[node * 2 + 1] = count;
		if (count <= LEAF) {
			this.kids[node * 2] = this.kids[node * 2 + 1] = -1;
			return node;
		}
		// split at the median centroid along the longer side
		const useX = x1 - x0 >= y1 - y0;
		const sub = Array.from(this.order.subarray(start, start + count));
		sub.sort((p, q) => (useX ? ax[p] + bx[p] - ax[q] - bx[q] : ay[p] + by[p] - ay[q] - by[q]));
		this.order.set(sub, start);
		const half = count >> 1;
		this.kids[node * 2] = this.build(start, half);
		this.kids[node * 2 + 1] = this.build(start + half, count - half);
		return node;
	}

	private boxDist2(node: number, px: number, py: number): number {
		const o = node * 4;
		const dx = px < this.box[o] ? this.box[o] - px : px > this.box[o + 2] ? px - this.box[o + 2] : 0;
		const dy = py < this.box[o + 1] ? this.box[o + 1] - py : py > this.box[o + 3] ? py - this.box[o + 3] : 0;
		return dx * dx + dy * dy;
	}

	/** Index of the nearest segment (lowest index on ties) and its t, via the hierarchy. */
	private search(px: number, py: number): { k: number; t: number; d2: number } {
		let best = Infinity, bestK = -1, bestT = 0;
		let sp = 0;
		if (this.nodes) this.stack[sp++] = 0;
		while (sp > 0) {
			const node = this.stack[--sp];
			if (this.boxDist2(node, px, py) > best) continue;
			const l = this.kids[node * 2];
			if (l < 0) {
				const start = this.span[node * 2], end = start + this.span[node * 2 + 1];
				for (let i = start; i < end; i++) {
					const k = this.order[i];
					segDist2(this.seg, k, px, py, this.tmp);
					if (this.tmp.d2 < best || (this.tmp.d2 === best && k < bestK)) {
						best = this.tmp.d2;
						bestK = k;
						bestT = this.tmp.t;
					}
				}
				continue;
			}
			const r = this.kids[node * 2 + 1];
			const dl = this.boxDist2(l, px, py), dr = this.boxDist2(r, px, py);
			// push the farther child first so the nearer one is searched first
			if (sp + 2 > this.stack.length) {
				const grown = new Int32Array(this.stack.length * 2);
				grown.set(this.stack);
				this.stack = grown;
			}
			if (dl <= dr) {
				this.stack[sp++] = r;
				this.stack[sp++] = l;
			} else {
				this.stack[sp++] = l;
				this.stack[sp++] = r;
			}
		}
		return { k: bestK, t: bestT, d2: best };
	}

	/** Same answer as search(), by checking every segment. For tests. */
	searchBrute(px: number, py: number): { k: number; t: number; d2: number } {
		let best = Infinity, bestK = -1, bestT = 0;
		for (let k = 0; k < this.seg.n; k++) {
			segDist2(this.seg, k, px, py, this.tmp);
			if (this.tmp.d2 < best) {
				best = this.tmp.d2;
				bestK = k;
				bestT = this.tmp.t;
			}
		}
		return { k: bestK, t: bestT, d2: best };
	}

	/**
	 * Signed distance (m) to the coast, positive on the ocean side, and the arc
	 * length along its polyline of the nearest point.
	 */
	nearest(px: number, py: number, brute = false): { s: number; arc: number } {
		const { k, t, d2 } = brute ? this.searchBrute(px, py) : this.search(px, py);
		const seg = this.seg;
		const abx = seg.bx[k] - seg.ax[k], aby = seg.by[k] - seg.ay[k];
		const cross = abx * (py - seg.ay[k]) - aby * (px - seg.ax[k]);
		// ocean on the right: cross < 0 is seaward (the reference rule, cross = 0 is land)
		const right = cross < 0 ? 1 : -1;
		const sign = this.side === 1 ? right : cross > 0 ? 1 : -1;
		return { s: Math.sqrt(d2) * sign, arc: seg.a0[k] + t * Math.hypot(abx, aby) };
	}
}

/** Depth (m) at signed distance s for a recipe, with a local shelf width. */
export function depthFromS(s: number, r: BathyRecipe, shelfWidth = r.shelfWidth): number {
	if (s <= 0) return s * r.landSlope;
	let d = s <= shelfWidth ? s * r.shelfSlope : shelfWidth * r.shelfSlope + (s - shelfWidth) * r.rampSlope;
	if (r.sandbar) {
		const z = (s - r.sandbar.offset) / r.sandbar.width;
		d = Math.max(0.1, d - r.sandbar.height * Math.exp(-0.5 * z * z));
	}
	return Math.min(d, r.maxDepth);
}

export interface BathyOptions {
	/**
	 * Sample each cell on an S x S sub-grid and average (default 1 = cell
	 * centre only). S = 5 on the J-Bay Run C grid reproduces build_demo.py's
	 * 5 x 5 block mean of Run A exactly.
	 */
	supersample?: number;
	/**
	 * Which side of the polyline's direction of travel the ocean is on.
	 * 'right' (default) is the OpenStreetMap coastline convention; map-kit's
	 * coastlineNear returns 'left' (OGC winding). See FRAME.md.
	 */
	oceanSide?: 'left' | 'right';
	/** check every segment instead of using the index (for tests; same result, slower) */
	bruteForce?: boolean;
}

/**
 * Build the depth grid for a coastline.
 * @param coast one polyline or several, ENU metres, ocean on the right
 *   unless opts.oceanSide says otherwise
 */
export function bathyFromPolyline(
	coast: Polyline | Polyline[],
	grid: GridSpec,
	recipe: BathyRecipe = JBAY_RECIPE,
	overrides: BathyOverrides = {},
	opts: BathyOptions = {}
): Bathy {
	const r: BathyRecipe = { ...recipe, ...overrides };
	const index = new CoastIndex(coast, opts.oceanSide ?? 'right');
	if (index.seg.n === 0) throw new Error('bathyFromPolyline: coast has no segments');
	const brute = opts.bruteForce ?? false;
	const { nx, ny } = grid;
	const n = nx * ny;
	const depth = new Float32Array(n);
	const land = new Uint8Array(n);
	const sOut = new Float32Array(n);

	const tilt = Math.tan((r.reefAngleDeg * Math.PI) / 180);
	let pivot = r.reefPivot ?? 0;
	if (tilt !== 0 && r.reefPivot === undefined) {
		const c = cellCentre(grid, (nx - 1) / 2, (ny - 1) / 2);
		pivot = index.nearest(c[0], c[1], brute).arc;
	}

	const rad = (grid.rotationDeg * Math.PI) / 180;
	const cr = Math.cos(rad);
	const sr = Math.sin(rad);
	const S = Math.max(1, Math.round(opts.supersample ?? 1));
	const sub = grid.dx / S;
	const off = ((S - 1) / 2) * sub;
	const depthAt = (u: number, v: number) => {
		const px = grid.origin[0] + u * cr - v * sr;
		const py = grid.origin[1] + u * sr + v * cr;
		const { s, arc } = index.nearest(px, py, brute);
		let w = r.shelfWidth;
		if (tilt !== 0) {
			w = Math.min(5 * r.shelfWidth, Math.max(0.2 * r.shelfWidth, w + tilt * (arc - pivot)));
		}
		// round through float32 so a supersampled mean matches a mean of a float32 grid
		return [Math.fround(depthFromS(s, r, w)), s];
	};
	for (let ix = 0; ix < nx; ix++) {
		for (let iy = 0; iy < ny; iy++) {
			let d = 0;
			let s = 0;
			for (let a = 0; a < S; a++) {
				for (let b = 0; b < S; b++) {
					const [dd, ss] = depthAt(ix * grid.dx - off + a * sub, iy * grid.dx - off + b * sub);
					d += dd;
					s += ss;
				}
			}
			const i = ix * ny + iy;
			depth[i] = d / (S * S);
			land[i] = depth[i] <= 0 ? 1 : 0;
			sOut[i] = s / (S * S);
		}
	}
	return { depth, land, s: sOut };
}

/**
 * Average a fine depth grid into blocks (bx by by cells), the way
 * `build_demo.py` downsamples Run A to the Run C grid. Both layouts are
 * idx = ix * ny + iy.
 */
export function blockMean(fine: Float32Array, nx: number, ny: number, bx: number, by: number): Float32Array {
	const cnx = Math.floor(nx / bx);
	const cny = Math.floor(ny / by);
	const out = new Float32Array(cnx * cny);
	for (let cx = 0; cx < cnx; cx++) {
		for (let cy = 0; cy < cny; cy++) {
			let acc = 0;
			for (let i = 0; i < bx; i++) {
				const row = (cx * bx + i) * ny + cy * by;
				for (let j = 0; j < by; j++) acc += fine[row + j];
			}
			out[cx * cny + cy] = acc / (bx * by);
		}
	}
	return out;
}

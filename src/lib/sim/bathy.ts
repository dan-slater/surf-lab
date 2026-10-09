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

/**
 * Signed distance from (px, py) to the nearest segment, positive on the right
 * (ocean) side, plus the arc length of the nearest point. Ties keep the first
 * segment, matching the reference implementation.
 */
function nearest(seg: Segments, px: number, py: number): { s: number; arc: number } {
	let best = Infinity;
	let sign = 1;
	let arc = 0;
	for (let k = 0; k < seg.n; k++) {
		const abx = seg.bx[k] - seg.ax[k];
		const aby = seg.by[k] - seg.ay[k];
		const l2 = abx * abx + aby * aby;
		if (l2 < 1e-9) continue;
		const apx = px - seg.ax[k];
		const apy = py - seg.ay[k];
		let t = (apx * abx + apy * aby) / l2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const dx = apx - t * abx;
		const dy = apy - t * aby;
		const d2 = dx * dx + dy * dy;
		if (d2 < best) {
			best = d2;
			sign = abx * apy - aby * apx < 0 ? 1 : -1;
			arc = seg.a0[k] + t * Math.sqrt(l2);
		}
	}
	return { s: Math.sqrt(best) * sign, arc };
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
}

/**
 * Build the depth grid for a coastline.
 * @param coast one polyline or several, ENU metres, ocean on the right
 */
export function bathyFromPolyline(
	coast: Polyline | Polyline[],
	grid: GridSpec,
	recipe: BathyRecipe = JBAY_RECIPE,
	overrides: BathyOverrides = {},
	opts: BathyOptions = {}
): Bathy {
	const r: BathyRecipe = { ...recipe, ...overrides };
	const seg = flatten(coast);
	if (seg.n === 0) throw new Error('bathyFromPolyline: coast has no segments');
	const { nx, ny } = grid;
	const n = nx * ny;
	const depth = new Float32Array(n);
	const land = new Uint8Array(n);
	const sOut = new Float32Array(n);

	const tilt = Math.tan((r.reefAngleDeg * Math.PI) / 180);
	let pivot = r.reefPivot ?? 0;
	if (tilt !== 0 && r.reefPivot === undefined) {
		const c = cellCentre(grid, (nx - 1) / 2, (ny - 1) / 2);
		pivot = nearest(seg, c[0], c[1]).arc;
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
		const { s, arc } = nearest(seg, px, py);
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

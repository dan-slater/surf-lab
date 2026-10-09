/**
 * Place a solver grid on a coastline: the shore along the long (iy) axis, land
 * on the low-ix side, the wavemaker offshore. The frame is described in
 * FRAME.md ("Choosing a grid from a coast").
 */
import { CoastIndex, type GridSpec, type Polyline, type Vec2 } from './bathy';

export interface GridFromCoastOptions {
	dx: number;
	/** cells across shore (default 2400 m / dx) */
	nx?: number;
	/** cells along shore (default 6400 m / dx) */
	ny?: number;
	/** side of the polylines' direction of travel the water is on (map-kit: 'left') */
	oceanSide?: 'left' | 'right';
	/** point of interest the grid is centred on along shore (ENU m, default [0, 0], the map-kit query point) */
	center?: Vec2;
	/** Gaussian radius (m) for weighting the coast around `center` when finding its direction (default ny dx / 4) */
	sigma?: number;
	/** minimum water between the coast and the wavemaker (m, default 1000) */
	minWater?: number;
	/** minimum land between the coast and the ix = 0 edge (m, default 150) */
	minLand?: number;
	/** preferred share of the cross-shore width that is land at `center` (default 0.35, the J-Bay reference domain's) */
	landFraction?: number;
	/** pin the rotation (deg) instead of choosing it, e.g. a catalogue spot with a hand-chosen frame */
	rotationDeg?: number;
}

/** 2 x 3 affine [a, b, c, d, e, f]: (x, y) = (a ix + b iy + c, d ix + e iy + f) */
export type Affine2 = [number, number, number, number, number, number];

export interface GridFromCoast {
	grid: GridSpec;
	/** grid index (ix, iy) -> ENU metres (cell centres) */
	toEnu: Affine2;
	/** ENU metres -> fractional grid index */
	fromEnu: Affine2;
	/** diagnostics, all in metres */
	info: {
		/** shortest coast-to-wavemaker distance over the core (the middle half along shore) */
		coreWater: number;
		/** same over the whole length, sponges included */
		minWater: number;
		/** shortest coast-to-land-edge distance over the core */
		coreLand: number;
		/** the placement could not meet minWater and minLand together; water was kept */
		squeezed: boolean;
	};
}

function lines(coast: Polyline | Polyline[]): Polyline[] {
	return coast.length > 0 && typeof (coast as Polyline)[0][0] === 'number' ? [coast as Polyline] : (coast as Polyline[]);
}

export function gridFromCoast(coast: Polyline | Polyline[], o: GridFromCoastOptions): GridFromCoast {
	const dx = o.dx;
	const nx = o.nx ?? Math.round(2400 / dx);
	const ny = o.ny ?? Math.round(6400 / dx);
	const side = o.oceanSide === 'left' ? -1 : 1;
	const [cx, cy] = o.center ?? [0, 0];
	const sigma = o.sigma ?? (ny * dx) / 4;
	const minWater = o.minWater ?? 1000;
	const minLand = o.minLand ?? 150;
	const landFraction = o.landFraction ?? 0.35;

	// 1. Starting guess: length-weighted second moments of the coast near the centre, and the
	//    mean ocean-side normal, both with Gaussian weights.
	let W = 0, mx = 0, my = 0;
	const segs: [number, number, number, number, number][] = []; // ax, ay, bx, by, weight
	for (const l of lines(coast)) {
		for (let i = 0; i + 1 < l.length; i++) {
			const [ax, ay] = l[i];
			const [bx, by] = l[i + 1];
			const len = Math.hypot(bx - ax, by - ay);
			if (len < 1e-9) continue;
			const r2 = ((ax + bx) / 2 - cx) ** 2 + ((ay + by) / 2 - cy) ** 2;
			const w = len * Math.exp((-0.5 * r2) / (sigma * sigma));
			segs.push([ax, ay, bx, by, w]);
			W += w;
			mx += (w * (ax + bx)) / 2;
			my += (w * (ay + by)) / 2;
		}
	}
	if (W <= 0) throw new Error('gridFromCoast: no coast segments near the centre');
	mx /= W;
	my /= W;
	let sxx = 0, sxy = 0, syy = 0, nxs = 0, nys = 0;
	for (const [ax, ay, bx, by, w] of segs) {
		const ux = (ax + bx) / 2 - mx, uy = (ay + by) / 2 - my;
		const dx_ = bx - ax, dy_ = by - ay;
		// second moment of a segment about its midpoint: d d^T / 12 per unit weight
		sxx += w * (ux * ux + (dx_ * dx_) / 12);
		sxy += w * (ux * uy + (dx_ * dy_) / 12);
		syy += w * (uy * uy + (dy_ * dy_) / 12);
		// ocean-side unit normal: right of travel is (dy, -dx)
		const len = Math.hypot(dx_, dy_);
		nxs += (w * side * dy_) / len;
		nys += (w * side * -dx_) / len;
	}
	// principal axis (shore direction)
	const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	let tx = Math.cos(ang), ty = Math.sin(ang);
	const aniso = Math.hypot(sxx - syy, 2 * sxy) / (sxx + syy);
	// offshore normal: perpendicular to the shore, on the ocean side; for a
	// coast with no clear axis (a round island) use the mean normal directly
	let nX: number, nY: number;
	if (aniso < 0.2 && Math.hypot(nxs, nys) > 1e-9) {
		const m = Math.hypot(nxs, nys);
		nX = nxs / m;
		nY = nys / m;
	} else {
		nX = ty;
		nY = -tx;
		if (nX * nxs + nY * nys < 0) {
			nX = -nX;
			nY = -nY;
		}
	}
	// 2. Refine: turn the frame so the wavemaker line runs parallel to the
	//    depth contours in front of the spot. Depth is a function of distance
	//    to the coast, so minimise the spread of that distance along a line
	//    offshore (where the wavemaker will sit) over the core, the middle half
	//    along shore. The principal axis is only the starting guess.
	const halfV = ((ny - 1) * dx) / 2;
	const core = halfV / 2;
	const index = new CoastIndex(coast, o.oceanSide ?? 'right');
	const offshore = (1 - landFraction) * (nx - 1) * dx;
	const spreadAt = (deg: number) => {
		const a = (deg * Math.PI) / 180;
		const ux = Math.cos(a), uy = Math.sin(a);
		let m = 0, m2 = 0, k = 0;
		const step = Math.max(dx, core / 64);
		for (let v = -core; v <= core; v += step) {
			const s = index.nearest(cx + offshore * ux - v * uy, cy + offshore * uy + v * ux).s;
			m += s;
			m2 += s * s;
			k++;
		}
		m /= k;
		return Math.sqrt(Math.max(0, m2 / k - m * m)) - Math.min(0, m); // also penalise a line on land
	};
	let rotationDeg = (Math.atan2(nY, nX) * 180) / Math.PI;
	if (o.rotationDeg !== undefined) {
		rotationDeg = o.rotationDeg;
	} else {
		let best = rotationDeg, bestS = spreadAt(rotationDeg);
		for (let d = -60; d <= 60; d += 1) {
			const sp = spreadAt(rotationDeg + d);
			if (sp < bestS) [best, bestS] = [rotationDeg + d, sp];
		}
		for (let d = -1; d <= 1; d += 0.1) {
			const sp = spreadAt(best + d);
			if (sp < bestS) [best, bestS] = [best + d, sp];
		}
		rotationDeg = ((((best + 180) % 360) + 360) % 360) - 180;
	}
	nX = Math.cos((rotationDeg * Math.PI) / 180);
	nY = Math.sin((rotationDeg * Math.PI) / 180);
	tx = -nY; // grid +iy is +ix turned 90 deg counter-clockwise
	ty = nX;

	// 3. Coast extent across shore (u, offshore) for points along shore (v)
	//    about the centre. Sample every dx along each segment.
	let coreMin = Infinity, coreMax = -Infinity, allMax = -Infinity;
	let uc = 0, wc = 0;
	for (const [ax, ay, bx, by] of segs) {
		const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / dx));
		for (let k = 0; k <= n; k++) {
			const px = ax + ((bx - ax) * k) / n - cx, py = ay + ((by - ay) * k) / n - cy;
			const u = px * nX + py * nY, v = px * tx + py * ty;
			if (Math.abs(v) > halfV) continue;
			allMax = Math.max(allMax, u);
			if (Math.abs(v) <= core) {
				coreMin = Math.min(coreMin, u);
				coreMax = Math.max(coreMax, u);
			}
			const w = Math.exp((-0.5 * v * v) / (dx * dx * 16)); // the coast right at the centre line
			uc += w * u;
			wc += w;
		}
	}
	if (!Number.isFinite(coreMin)) throw new Error('gridFromCoast: no coast inside the grid core');
	uc = wc > 0 ? uc / wc : (coreMin + coreMax) / 2;

	// 4. Cross-shore placement: the land edge at u0, the wavemaker at u0 + Wd.
	//    Prefer the coast at landFraction of the width, within
	//    [coreMax + minWater - Wd, coreMin - minLand]; keep the water if both cannot hold.
	const Wd = (nx - 1) * dx;
	const lo = coreMax + minWater - Wd;
	const hi = coreMin - minLand;
	let u0 = uc - landFraction * Wd;
	const squeezed = lo > hi;
	u0 = squeezed ? lo : Math.min(hi, Math.max(lo, u0));

	const origin: Vec2 = [cx + u0 * nX - halfV * tx, cy + u0 * nY - halfV * ty];
	const grid: GridSpec = { nx, ny, dx, origin, rotationDeg };
	const toEnu: Affine2 = [dx * nX, dx * tx, origin[0], dx * nY, dx * ty, origin[1]];
	// inverse of an orthogonal frame scaled by dx
	const fromEnu: Affine2 = [
		nX / dx, nY / dx, -(origin[0] * nX + origin[1] * nY) / dx,
		tx / dx, ty / dx, -(origin[0] * tx + origin[1] * ty) / dx
	];
	return {
		grid,
		toEnu,
		fromEnu,
		info: { coreWater: u0 + Wd - coreMax, minWater: u0 + Wd - allMax, coreLand: coreMin - u0, squeezed }
	};
}

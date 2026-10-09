/**
 * Grid frame choice for a coast (FRAME-CHOICE.md): the sim line's
 * gridFromCoast, guarded by a direct look at where the open sea is.
 */
import { CoastIndex, type Polyline, type Vec2 } from '../sim/bathy';
import { gridFromCoast, type GridFromCoast } from '../sim/grid';

const DEG = Math.PI / 180;

export interface OpenSea {
	/** ENU angle (deg, counter-clockwise from east) toward the most open water from the centre */
	angleDeg: number;
	/** the same as a compass bearing (deg, clockwise from north) */
	bearingDeg: number;
	/** share of samples along the best ray that are water, 0..1 */
	openness: number;
}

/**
 * Cast rays from `center` every 5 deg out to `reach` metres and score each by
 * the mean signed distance to the coast along it (positive in water). A ray
 * straight out to sea gains distance fastest; one running along the shore
 * stays near it, and one into a harbour, lagoon or river mouth meets land.
 * Scores are smoothed over +-15 deg so one gap between piers does not win.
 */
export function openSea(
	coast: Polyline[],
	oceanSide: 'left' | 'right',
	center: Vec2 = [0, 0],
	reach = 1800
): OpenSea {
	const index = new CoastIndex(coast, oceanSide);
	const step = 30;
	const n = 72;
	const raw = new Float64Array(n);
	const wet = new Float64Array(n);
	for (let k = 0; k < n; k++) {
		const a = k * 5 * DEG;
		const ux = Math.cos(a), uy = Math.sin(a);
		let score = 0, total = 0, w = 0;
		for (let r = step; r <= reach; r += step) {
			const s = index.nearest(center[0] + r * ux, center[1] + r * uy).s;
			total += r;
			score += Math.max(-r, Math.min(r, s));
			if (s > 0) w++;
		}
		raw[k] = score / total;
		wet[k] = w / Math.floor(reach / step);
	}
	let best = 0, bestScore = -Infinity;
	for (let k = 0; k < n; k++) {
		let acc = 0;
		for (let j = -3; j <= 3; j++) acc += raw[(k + j + n) % n] * (4 - Math.abs(j));
		if (acc > bestScore) [best, bestScore] = [k, acc];
	}
	const angleDeg = best * 5;
	return { angleDeg, bearingDeg: (((90 - angleDeg) % 360) + 360) % 360, openness: wet[best] };
}

const angleBetween = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/**
 * Place a grid on a clicked coast. gridFromCoast's frame is kept when its
 * offshore axis (+ix) points within 60 deg of the open sea; otherwise it was
 * misled by enclosed water near the click and the grid is re-placed with its
 * rotation pinned to the open-sea direction.
 */
export function gridForCoast(
	coast: Polyline[],
	opts: { dx: number; nx: number; ny: number; oceanSide: 'left' | 'right'; rotationDeg?: number }
): GridFromCoast & { open: OpenSea; guarded: boolean } {
	const open = openSea(coast, opts.oceanSide);
	if (opts.rotationDeg !== undefined) return { ...gridFromCoast(coast, opts), open, guarded: false };
	const g = gridFromCoast(coast, opts);
	if (angleBetween(g.grid.rotationDeg, open.angleDeg) <= 60) return { ...g, open, guarded: false };
	return { ...gridFromCoast(coast, { ...opts, rotationDeg: open.angleDeg }), open, guarded: true };
}

/**
 * Camera for a page canvas (outside map-kit, where affineFromOverlay does
 * this job): which ENU point is at the centre, how many metres span the
 * width, and which compass bearing points up the screen.
 */
import { cellCentre, type GridSpec, type Vec2 } from '../bathy';
import type { Affine } from '../debug-render';

export interface View {
	/** ENU point at the centre of the canvas (m) */
	center: Vec2;
	/** metres across the canvas width */
	metersAcross: number;
	/** compass bearing that points up the screen (deg; 0 = north up, 90 = east up) */
	upDeg: number;
}

/** ENU -> CSS pixels for a view on a width x height canvas. */
export function viewToPixel(v: View, width: number, height: number) {
	const a = (v.upDeg * Math.PI) / 180;
	const up: Vec2 = [Math.sin(a), Math.cos(a)];
	const right: Vec2 = [Math.cos(a), -Math.sin(a)];
	const s = width / v.metersAcross;
	return (x: number, y: number): [number, number] => {
		const dx = x - v.center[0], dy = y - v.center[1];
		return [width / 2 + s * (dx * right[0] + dy * right[1]), height / 2 - s * (dx * up[0] + dy * up[1])];
	};
}

/** Grid -> clip affine for a view (exact: the view is a similarity transform). */
export function viewAffine(grid: GridSpec, v: View, width: number, height: number): Affine {
	const toPx = viewToPixel(v, width, height);
	const clip = (ix: number, iy: number) => {
		const [px, py] = toPx(...cellCentre(grid, ix, iy));
		return [(2 * px) / width - 1, 1 - (2 * py) / height];
	};
	const o = clip(0, 0), u = clip(1, 0), w = clip(0, 1);
	return [u[0] - o[0], w[0] - o[0], o[0], u[1] - o[1], w[1] - o[1], o[1]];
}

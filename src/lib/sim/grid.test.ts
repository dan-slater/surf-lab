import { describe, expect, test } from 'bun:test';
import { bathyFromPolyline, cellCentre, type GridSpec, type Polyline } from './bathy';
import { gridFromCoast } from './grid';
import { JBAY, jbayGrid } from '../spots/jbay';

const at = (g: GridSpec, ix: number, iy: number) => cellCentre(g, ix, iy);
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angDiff = (a: number, b: number) => Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180);

/** Land on the low-ix side and water at the wavemaker, along the core. */
function checkOrientation(coast: Polyline | Polyline[], g: GridSpec, oceanSide: 'left' | 'right' = 'right') {
	const { depth } = bathyFromPolyline(coast, g, undefined, {}, { oceanSide });
	const { nx, ny } = g;
	for (let iy = Math.round(ny / 4); iy < Math.round((3 * ny) / 4); iy += 8) {
		expect(depth[0 * ny + iy]).toBeLessThan(0);
		expect(depth[(nx - 1) * ny + iy]).toBeGreaterThan(10);
	}
}

describe('gridFromCoast', () => {
	test('J-Bay: lands on the hand-chosen Run A frame (1.4 deg, 23 m at the centre)', () => {
		const ref = jbayGrid(6.25);
		const r = gridFromCoast(JBAY.coast, { dx: 6.25, center: [200, 300] });
		const g = r.grid;
		expect(g.nx).toBe(ref.nx);
		expect(g.ny).toBe(ref.ny);
		expect(Math.abs(g.rotationDeg)).toBeLessThan(2);
		expect(dist(at(g, 191.5, 511.5), at(ref, 191.5, 511.5))).toBeLessThan(30);
		expect(r.info.coreWater).toBeGreaterThan(1000);
		checkOrientation(JBAY.coast, g);
	});

	test('J-Bay with the rotation pinned (catalogue frame): every corner within 30 m', () => {
		const ref = jbayGrid(6.25);
		const g = gridFromCoast(JBAY.coast, { dx: 6.25, center: [200, 300], rotationDeg: 0 }).grid;
		for (const [i, j] of [[0, 0], [383, 0], [0, 1023], [383, 1023]]) expect(dist(at(g, i, j), at(ref, i, j))).toBeLessThan(30);
	});

	for (const phi of [0, 37, 128]) {
		test(`straight beach running at ${phi} deg`, () => {
			// beach through the origin along direction phi, water on the right
			const a = (phi * Math.PI) / 180;
			const coast: Polyline = [];
			for (let s = -6000; s <= 6000; s += 50) coast.push([s * Math.cos(a), s * Math.sin(a)]);
			const r = gridFromCoast(coast, { dx: 12.5 });
			// offshore = right of travel = direction phi - 90
			expect(angDiff(r.grid.rotationDeg, phi - 90)).toBeLessThan(0.5);
			// coast at 35 % of the width from the land edge
			const u0 = -(r.grid.origin[0] * Math.cos(a - Math.PI / 2) + r.grid.origin[1] * Math.sin(a - Math.PI / 2));
			expect(u0 / ((r.grid.nx - 1) * 12.5)).toBeCloseTo(0.35, 2);
			expect(r.info.minWater).toBeGreaterThan(1000);
			checkOrientation(coast, r.grid);
		});
	}

	function bay(radius: number): Polyline {
		// a semicircular bay cut into a south-facing coast, walked west to east
		const coast: Polyline = [];
		for (let x = -6000; x < -radius; x += 50) coast.push([x, 0]);
		for (let k = 0; k <= 60; k++) {
			const t = Math.PI - (Math.PI * k) / 60;
			coast.push([radius * Math.cos(t), radius * Math.sin(t)]);
		}
		for (let x = radius + 50; x <= 6000; x += 50) coast.push([x, 0]);
		// walking east, left is north (land); reverse so the water is on the left
		return coast.reverse();
	}

	test('a bay too deep for the width keeps the 1 km of water and reports it', () => {
		const r = gridFromCoast(bay(1250), { dx: 12.5, oceanSide: 'left', center: [0, 600] });
		expect(r.info.squeezed).toBe(true);
		expect(r.info.coreWater).toBeGreaterThanOrEqual(1000 - 1e-6);
	});

	test('a bay opening to the south, water on the left (map-kit winding)', () => {
		const coast = bay(1000);
		const r = gridFromCoast(coast, { dx: 12.5, oceanSide: 'left', center: [0, 500] });
		expect(angDiff(r.grid.rotationDeg, -90)).toBeLessThan(5); // offshore points south
		expect(r.info.coreWater).toBeGreaterThanOrEqual(1000 - 1e-6);
		expect(r.info.squeezed).toBe(false);
		checkOrientation(coast, r.grid, 'left');
	});

	test('toEnu and fromEnu invert each other and match cellCentre', () => {
		const r = gridFromCoast(JBAY.coast, { dx: 12.5 });
		const [a, b, c, d, e, f] = r.toEnu;
		const [p, q, rr, s, t, u] = r.fromEnu;
		for (const [ix, iy] of [[0, 0], [10, 300], [191, 511]]) {
			const x = a * ix + b * iy + c, y = d * ix + e * iy + f;
			const cc = cellCentre(r.grid, ix, iy);
			expect(x).toBeCloseTo(cc[0], 6);
			expect(y).toBeCloseTo(cc[1], 6);
			expect(p * x + q * y + rr).toBeCloseTo(ix, 6);
			expect(s * x + t * y + u).toBeCloseTo(iy, 6);
		}
	});
});

import { describe, expect, test } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { bathyFromPolyline, cellCentre, JBAY_RECIPE, type GridSpec } from './bathy';
import { JBAY, JBAY_GRID } from '../spots/jbay';

function loadRunADepth(): Float32Array {
	const gz = readFileSync(new URL('./fixtures/jbay-runA-depth-192x512.f32.gz', import.meta.url));
	const raw = gunzipSync(gz);
	return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

function bathyParity(supersample: number) {
	const ref = loadRunADepth();
	const t0 = performance.now();
	const b = bathyFromPolyline(JBAY.coast, JBAY_GRID, JBAY_RECIPE, {}, { supersample });
	const ms = performance.now() - t0;
	let max = 0;
	let sq = 0;
	let maxWet = 0;
	let sqWet = 0;
	let nWet = 0;
	let landMismatch = 0;
	for (let i = 0; i < ref.length; i++) {
		const e = Math.abs(b.depth[i] - ref[i]);
		max = Math.max(max, e);
		sq += e * e;
		if (ref[i] > 0) {
			maxWet = Math.max(maxWet, e);
			sqWet += e * e;
			nWet++;
		}
		if ((ref[i] <= 0) !== (b.land[i] === 1)) landMismatch++;
	}
	return {
		ms,
		max,
		rms: Math.sqrt(sq / ref.length),
		maxWet,
		rmsWet: Math.sqrt(sqWet / nWet),
		landMismatch,
		cells: ref.length
	};
}

describe('bathyFromPolyline', () => {
	test('J-Bay, supersample 5: exact match with Run A block-averaged to 192x512', () => {
		const p = bathyParity(5);
		expect(p.max).toBeLessThan(1e-4);
		expect(p.landMismatch).toBe(0);
	});

	test('J-Bay, cell-centre sampling: close to Run A block mean', () => {
		const p = bathyParity(1);
		expect(p.rms).toBeLessThan(0.05);
		expect(p.rmsWet).toBeLessThan(0.01);
		expect(p.maxWet).toBeLessThan(1.0);
	});

	test('straight coast gives the textbook profile', () => {
		// coast along y at x = 0 walking north: ocean (east, +x) is on the right
		const coast: [number, number][] = [
			[0, -5000],
			[0, 5000]
		];
		const grid: GridSpec = { nx: 100, ny: 4, dx: 10, origin: [-200, 0], rotationDeg: 0 };
		const b = bathyFromPolyline(coast, grid);
		const at = (x: number) => b.depth[((x + 200) / 10) * 4 + 1];
		expect(at(-100)).toBeCloseTo(-4, 5); // land, 1:25
		expect(at(100)).toBeCloseTo(4, 5); // shelf, 1:25
		expect(at(250)).toBeCloseTo(10, 5);
		expect(at(390)).toBeCloseTo(12, 5); // ramp, 1:70
	});

	test('rotation places cells in ENU', () => {
		const g: GridSpec = { nx: 2, ny: 2, dx: 10, origin: [5, 5], rotationDeg: 90 };
		const c = cellCentre(g, 1, 0);
		expect(c[0]).toBeCloseTo(5, 9);
		expect(c[1]).toBeCloseTo(15, 9);
	});

	test('overrides: maxDepth, sandbar, reef angle', () => {
		const coast: [number, number][] = [
			[0, -5000],
			[0, 5000]
		];
		const grid: GridSpec = { nx: 120, ny: 50, dx: 10, origin: [-100, -250], rotationDeg: 0 };
		const capped = bathyFromPolyline(coast, grid, JBAY_RECIPE, { maxDepth: 8 });
		expect(Math.max(...capped.depth)).toBeCloseTo(8, 5);
		const bar = bathyFromPolyline(coast, grid, JBAY_RECIPE, {
			sandbar: { offset: 100, height: 2, width: 20 }
		});
		expect(bar.depth[20 * 50 + 25]).toBeCloseTo(2, 4); // x = 100: 4 m shelf minus 2 m bar
		const tilt = bathyFromPolyline(coast, grid, JBAY_RECIPE, { reefAngleDeg: 20 });
		// further along the coast the steep 1:25 shelf is wider, so the same offshore cell is deeper
		const ix = 50; // x = 400, past the nominal shelf edge
		expect(tilt.depth[ix * 50 + 49]).toBeGreaterThan(tilt.depth[ix * 50 + 0]);
	});
});

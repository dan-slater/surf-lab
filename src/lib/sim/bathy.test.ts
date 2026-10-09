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

	// a map-kit style coast: thousands of short segments, water on the LEFT,
	// split into two polylines at a river mouth
	function wigglyCoast(n: number): [number, number][][] {
		const pts: [number, number][] = [];
		for (let i = 0; i < n; i++) {
			const y = 3200 - (6400 * i) / (n - 1); // walking south: water (east) is on the left
			pts.push([-200 + 150 * Math.sin(y / 400) + 20 * Math.sin(y / 23) + 5 * Math.sin(y / 3.1), y]);
		}
		const mouth = Math.floor(n * 0.6);
		return [pts.slice(0, mouth), pts.slice(mouth + 3)];
	}

	test('the index returns exactly the brute-force answer on a 4000-vertex coast', () => {
		const coast = wigglyCoast(4000);
		const grid: GridSpec = { nx: 96, ny: 256, dx: 25, origin: [-1000, -3200], rotationDeg: 12 };
		const t0 = performance.now();
		const fast = bathyFromPolyline(coast, grid, JBAY_RECIPE, {}, { oceanSide: 'left' });
		const t1 = performance.now();
		const slow = bathyFromPolyline(coast, grid, JBAY_RECIPE, {}, { oceanSide: 'left', bruteForce: true });
		const t2 = performance.now();
		console.log(`4000-vertex coast, ${grid.nx * grid.ny} cells: index ${(t1 - t0).toFixed(0)} ms, brute force ${(t2 - t1).toFixed(0)} ms`);
		expect(Array.from(fast.depth)).toEqual(Array.from(slow.depth));
		expect(Array.from(fast.s)).toEqual(Array.from(slow.s));
		// water is east of the coast
		expect(fast.depth[(grid.nx - 1) * grid.ny + 100]).toBeGreaterThan(10);
		expect(fast.depth[0 * grid.ny + 100]).toBeLessThan(0);
	});

	test("oceanSide 'left' on a reversed polyline gives the same depth as 'right'", () => {
		const right = JBAY.coast;
		const left = [...JBAY.coast].reverse();
		const a = bathyFromPolyline(right, JBAY_GRID);
		const b = bathyFromPolyline(left, JBAY_GRID, JBAY_RECIPE, {}, { oceanSide: 'left' });
		let max = 0;
		for (let i = 0; i < a.depth.length; i++) max = Math.max(max, Math.abs(a.depth[i] - b.depth[i]));
		// identical except where reversing the order changes which of two equidistant segments wins
		expect(max).toBeLessThan(1e-3);
	});
});

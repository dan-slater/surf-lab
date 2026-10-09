import { describe, expect, test } from 'bun:test';
import { FrontCore, MAX_SURFER_SPEED, TRACKER_DEFAULTS } from './fronts';
import type { GridSpec } from '../bathy';

const grid: GridSpec = { nx: 100, ny: 400, dx: 5, origin: [0, 0], rotationDeg: 0 };
const opts = { ...TRACKER_DEFAULTS, bridge: 0 };

/** rows for one broken section from row a to b at ix = 10, a wave travelling at angle `deg` off shore-normal */
function rows(a: number, b: number, deg: number, h = 1.2): Float32Array {
	const r = new Float32Array(grid.ny * 8);
	for (let iy = 0; iy < grid.ny; iy++) r[iy * 8] = -1;
	const t = (deg * Math.PI) / 180;
	for (let iy = a; iy <= b; iy++) {
		r.set([10, 1, h, 0.5, -Math.cos(t) * 2, Math.sin(t) * 2, 0, 0], iy * 8);
	}
	return r;
}

describe('FrontCore', () => {
	test('a section growing north at 8 m/s gives one peeling front with the P4 speed', () => {
		const core = new FrontCore(grid, opts);
		const v = 8, dt = 0.25;
		for (let k = 0; k < 12; k++) {
			const b = 100 + Math.round((v * dt * k) / grid.dx);
			core.ingest(rows(80, b, 40), k * dt);
		}
		const f = core.fronts();
		const peel = f.filter((x) => x.peeling);
		expect(peel.length).toBe(1);
		expect(peel[0].dir[1]).toBeGreaterThan(0.95); // north
		expect(peel[0].speed).toBeGreaterThan(6.5);
		expect(peel[0].speed).toBeLessThan(9.5);
		// crest at 40 deg to a shore-parallel breaker line
		expect((peel[0].alpha * 180) / Math.PI).toBeCloseTo(40, 0);
		expect(peel[0].vp).toBeCloseTo(Math.sqrt(9.81 * 1.2) / Math.sin((40 * Math.PI) / 180), 3);
		expect(peel[0].makeable).toBe(peel[0].vp <= MAX_SURFER_SPEED);
		// the static southern end is not a peel
		expect(f.find((x) => !x.peeling && x.y < 450)).toBeDefined();
	});

	test('a near-closeout (crest almost parallel to the breaker line) is not makeable', () => {
		const core = new FrontCore(grid, opts);
		core.ingest(rows(50, 300, 3), 0);
		const f = core.fronts();
		expect(f.length).toBe(2);
		expect(f.every((x) => !x.makeable)).toBe(true);
	});

	test('sections split at gaps and at large cross-shore jumps; old fronts expire', () => {
		const core = new FrontCore(grid, opts);
		const r = rows(20, 60, 30);
		const r2 = rows(70, 120, 30);
		for (let iy = 70; iy <= 120; iy++) r[iy * 8 + 0] = 10, r.set(r2.subarray(iy * 8, iy * 8 + 8), iy * 8);
		for (let iy = 90; iy <= 120; iy++) r[iy * 8] = 30; // jumps 100 m seaward
		core.ingest(r, 0);
		expect(core.fronts().length).toBe(6);
		core.ingest(rows(0, -1, 0), 2);
		expect(core.fronts().length).toBe(0);
	});
});

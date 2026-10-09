import { describe, expect, test } from 'bun:test';
import { createCpuSolver } from './cpu';
import { bathyFromPolyline } from './bathy';
import { JBAY, JBAY_GRID, JBAY_RUN_A_SWELL } from '../spots/jbay';
import { compassFromTheta, swellComponents, thetaFromCompass } from './swell';

const calm = { Hs: 0, Tp: 15, dirDeg: 120, spread: 20 };

describe('CPU twin of step.wgsl', () => {
	test('lake at rest over rough bed with a dry island stays at rest', () => {
		const nx = 40, ny = 30;
		const depth = new Float32Array(nx * ny);
		for (let ix = 0; ix < nx; ix++)
			for (let iy = 0; iy < ny; iy++) depth[ix * ny + iy] = 5 + 3 * Math.sin(ix * 0.7) * Math.cos(iy * 0.4) - (ix < 6 ? 12 : 0);
		const s = createCpuSolver({ nx, ny, dx: 10, depth, swell: calm, dt: 0.2 });
		s.step(200);
		let maxEta = 0, maxQ = 0;
		const eta = s.readEta();
		for (let i = 0; i < nx * ny; i++) {
			if (depth[i] > 0) maxEta = Math.max(maxEta, Math.abs(eta[i]));
			maxQ = Math.max(maxQ, Math.abs(s.state[i * 4 + 1]), Math.abs(s.state[i * 4 + 2]));
		}
		expect(maxEta).toBeLessThan(1e-5);
		expect(maxQ).toBeLessThan(1e-5);
	});

	test('wavemaker phase travels at sqrt(g d) over a flat bed', () => {
		const nx = 200, ny = 4, d = 10, dx = 5;
		const depth = new Float32Array(nx * ny).fill(d);
		const s = createCpuSolver({
			nx, ny, dx, depth, dt: 0.1,
			swell: { Hs: 0.2, Tp: 20, dirDeg: 90, spread: 0, spectrum: 'mono' },
			sponge: { width: 0 }
		});
		// dirDeg 90 = from the east: waves enter at ix = nx - 1 and head toward -ix
		const at = (ix: number) => s.state[(ix * ny + 1) * 4] - d;
		const crossA: number[] = [], crossB: number[] = [];
		let pa = 0, pb = 0;
		for (let k = 0; k < 3000; k++) {
			s.step(1);
			const a = at(180), b = at(160);
			if (s.time > 100) {
				if (pa < 0 && a >= 0) crossA.push(s.time);
				if (pb < 0 && b >= 0) crossB.push(s.time);
			}
			pa = a;
			pb = b;
		}
		const n = Math.min(crossA.length, crossB.length);
		let lag = 0;
		for (let i = 0; i < n; i++) lag += crossB[i] - crossA[i];
		lag /= n;
		const c = (20 * dx) / lag;
		expect(c).toBeGreaterThan(0.95 * Math.sqrt(9.81 * d));
		expect(c).toBeLessThan(1.05 * Math.sqrt(9.81 * d));
	});

	test('first-order damping of a 15 s swell at dx 12.5 m is as documented in PARITY.md', () => {
		// Characterises the scheme rather than asserting physics: numerical
		// diffusion ~ c dx / 2 gives an e-folding distance of ~265 m here.
		const nx = 80, ny = 4, d = 25;
		const depth = new Float32Array(nx * ny).fill(d);
		const s = createCpuSolver({ nx, ny, dx: 12.5, depth, swell: { Hs: 0.5, Tp: 15, dirDeg: 90, spread: 0, spectrum: 'mono' }, sponge: { width: 0 } });
		const lo = new Float64Array(nx).fill(Infinity), hi = new Float64Array(nx).fill(-Infinity);
		for (let k = 0; k < 3000; k++) {
			s.step(1);
			if (s.time > 200)
				for (let ix = 0; ix < nx; ix++) {
					const e = s.state[(ix * ny + 1) * 4] - d;
					lo[ix] = Math.min(lo[ix], e);
					hi[ix] = Math.max(hi[ix], e);
				}
		}
		const H = (ix: number) => hi[ix] - lo[ix];
		const ratio = H(nx - 7 - 40) / H(nx - 7); // 500 m inshore of the band
		expect(ratio).toBeGreaterThan(0.1);
		expect(ratio).toBeLessThan(0.25);
	});

	test('compass and grid angles round-trip; Run A theta0 = 150 deg is from 120 deg', () => {
		expect((thetaFromCompass(120) * 180) / Math.PI).toBeCloseTo(150, 9);
		expect(compassFromTheta(thetaFromCompass(222, 30), 30)).toBeCloseTo(222, 9);
	});

	test('JONSWAP components carry the target Hs', () => {
		const c = swellComponents(JBAY_RUN_A_SWELL, 25);
		const m0 = c.reduce((a, k) => a + 0.5 * k.amp * k.amp, 0);
		expect(4 * Math.sqrt(m0)).toBeCloseTo(2.5, 1);
		expect(c.length).toBeGreaterThan(150);
	});

	test('J-Bay smoke: 120 s of Run A swell stays finite and makes foam', () => {
		const b = bathyFromPolyline(JBAY.coast, JBAY_GRID);
		const s = createCpuSolver({ nx: 192, ny: 512, dx: 12.5, depth: b.depth, swell: JBAY_RUN_A_SWELL });
		s.step(1000);
		let finite = true, foamCells = 0;
		for (let i = 0; i < s.state.length; i++) if (!Number.isFinite(s.state[i])) finite = false;
		const f = s.readFoam();
		for (let i = 0; i < f.length; i++) if (f[i] > 0.5) foamCells++;
		expect(finite).toBe(true);
		expect(foamCells).toBeGreaterThan(0);
	}, 60000);
});

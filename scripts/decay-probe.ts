// Amplitude of a monochromatic swell vs distance from the wavemaker over a flat bed.
import { createCpuSolver } from '../src/lib/sim/cpu';
const [d, T, dx, dt] = (process.argv[2] ?? '25,15,12.5,0.12').split(',').map(Number);
const scheme = (process.argv[3] ?? 'muscl') as 'muscl' | 'first-order';
const nx = 200, ny = 4;
const depth = new Float32Array(nx * ny).fill(d);
const s = createCpuSolver({ nx, ny, dx, depth, dt, scheme, swell: { Hs: 0.5, Tp: T, dirDeg: 90, spread: 0, spectrum: 'mono' }, sponge: { width: 0 } });
const steps = Math.round(600 / dt);
const mx = new Float64Array(nx), mn = new Float64Array(nx);
for (let k = 0; k < steps; k++) {
	s.step(1);
	if (s.time > 400) for (let ix = 0; ix < nx; ix++) { const e = s.state[(ix * ny + 1) * 4] - d; mx[ix] = Math.max(mx[ix], e); mn[ix] = Math.min(mn[ix], e); }
}
const c = Math.sqrt(9.81 * d), L = c * T;
console.log(`${scheme} d=${d} T=${T} dx=${dx} dt=${dt} L=${L.toFixed(0)}m (${(L / dx).toFixed(1)} cells/wavelength)`);
for (const dist of [0, 250, 500, 750, 1000, 1500, 2000]) {
	const ix = nx - 7 - Math.round(dist / dx);
	if (ix < 2) break;
	console.log(`  ${dist} m from wavemaker: H = ${(mx[ix] - mn[ix]).toFixed(3)} m`);
}

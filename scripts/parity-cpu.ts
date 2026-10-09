/**
 * The J-Bay parity run on the CPU twin (no browser, no GPU), with the same
 * options as /sim/parity.
 *   bun scripts/parity-cpu.ts [spinup=480] [record=120] [out=parity-out/cpu.json] [scheme=muscl] [dx=6.25]
 */
import { writeFileSync } from 'node:fs';
import { bathyFromPolyline } from '../src/lib/sim/bathy';
import { createCpuSolver } from '../src/lib/sim/cpu';
import { JBAY, JBAY_RUN_A_SWELL, jbayGrid } from '../src/lib/spots/jbay';

const spinup = Number(process.argv[2] ?? 480);
const record = Number(process.argv[3] ?? 120);
const out = process.argv[4] ?? 'parity-out/cpu.json';
const scheme = (process.argv[5] ?? 'muscl') as 'muscl' | 'first-order';
const dx = Number(process.argv[6] ?? 6.25);
const grid = jbayGrid(dx);
const { depth } = bathyFromPolyline(JBAY.coast, grid, undefined, {}, { supersample: Math.max(1, Math.round(dx / 2.5)) });
const s = createCpuSolver({
	nx: grid.nx, ny: grid.ny, dx, depth, swell: JBAY_RUN_A_SWELL, scheme,
	wavemaker: { width: 75 / dx },
	sponge: { width: 150 / dx }
});
console.log(`cpu ${scheme} ${grid.nx} x ${grid.ny} at ${dx} m, dt ${s.params.dt.toFixed(3)} s, Froude ${s.params.froudeT.toFixed(2)}`);
const t0 = performance.now();
const total = Math.round((spinup + record) / s.params.dt);
const spinSteps = Math.round(spinup / s.params.dt);
for (let k = 0; k < spinSteps; k += 100) {
	s.step(Math.min(100, spinSteps - k));
	if (k % 1000 === 0) console.log(`step ${k}/${total} ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
s.startStats();
s.step(total - spinSteps);
const st = s.readStats();
const wallMs = performance.now() - t0;
console.log(`cpu: ${spinup + record} s model in ${(wallMs / 1000).toFixed(1)} s wall, ${st.samples} samples`);
writeFileSync(out, JSON.stringify({ engine: 'cpu', scheme, dx, nx: grid.nx, ny: grid.ny, spinup, record, dt: s.params.dt, samples: st.samples, wallMs,
	Hs: Array.from(st.Hs), foamMean: Array.from(st.foamMean), foamFrac: Array.from(st.foamFrac),
	eta: Array.from(s.readEta()), foam: Array.from(s.readFoam()) }));
console.log(`wrote ${out}`);

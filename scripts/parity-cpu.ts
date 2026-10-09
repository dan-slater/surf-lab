/**
 * The same J-Bay parity run on the CPU twin (no browser, no GPU).
 *   bun scripts/parity-cpu.ts [spinup=480] [record=120] [out=parity-out/cpu.json]
 */
import { writeFileSync } from 'node:fs';
import { bathyFromPolyline } from '../src/lib/sim/bathy';
import { createCpuSolver } from '../src/lib/sim/cpu';
import { JBAY, JBAY_GRID, JBAY_RUN_A_SWELL } from '../src/lib/spots/jbay';

const spinup = Number(process.argv[2] ?? 480);
const record = Number(process.argv[3] ?? 120);
const out = process.argv[4] ?? 'parity-out/cpu.json';
const { depth } = bathyFromPolyline(JBAY.coast, JBAY_GRID, undefined, {}, { supersample: 5 });
const s = createCpuSolver({ nx: JBAY_GRID.nx, ny: JBAY_GRID.ny, dx: JBAY_GRID.dx, depth, swell: JBAY_RUN_A_SWELL });
const t0 = performance.now();
s.step(Math.round(spinup / s.params.dt));
s.startStats();
s.step(Math.round(record / s.params.dt));
const st = s.readStats();
const wallMs = performance.now() - t0;
console.log(`cpu: ${spinup + record} s model in ${(wallMs / 1000).toFixed(1)} s wall, ${st.samples} samples`);
writeFileSync(out, JSON.stringify({ engine: 'cpu', spinup, record, dt: s.params.dt, samples: st.samples, wallMs,
	Hs: Array.from(st.Hs), foamMean: Array.from(st.foamMean), foamFrac: Array.from(st.foamFrac),
	eta: Array.from(s.readEta()), foam: Array.from(s.readFoam()) }));
console.log(`wrote ${out}`);

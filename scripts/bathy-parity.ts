/**
 * Bathymetry parity vs Run A (reads ~/surf-sim/out/A4-full/depth.f32, never committed).
 *   bun scripts/bathy-parity.ts [path/to/depth.f32]
 * 1. full-res: rebuild the 960 x 2560 @ 2.5 m grid and compare cell by cell
 * 2. Run C grid: point-sample at 192 x 512 @ 12.5 m and compare with the 5 x 5 block mean
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { bathyFromPolyline, blockMean, JBAY_RECIPE } from '../src/lib/sim/bathy';
import { JBAY, JBAY_GRID } from '../src/lib/spots/jbay';

const path = process.argv[2] ?? `${homedir()}/surf-sim/out/A4-full/depth.f32`;
const raw = readFileSync(path);
const ref = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const NX = 960, NY = 2560;

function compare(a: Float32Array, b: Float32Array, nx: number, ny: number, x0: number, y0: number, dx: number) {
	let max = 0, at = [0, 0], sq = 0, maxWet = 0, sqWet = 0, nWet = 0, over10cm = 0;
	for (let ix = 0; ix < nx; ix++)
		for (let iy = 0; iy < ny; iy++) {
			const i = ix * ny + iy;
			const e = Math.abs(a[i] - b[i]);
			if (e > max) { max = e; at = [x0 + ix * dx, y0 + iy * dx]; }
			sq += e * e;
			if (e > 0.1) over10cm++;
			if (b[i] > 0) { maxWet = Math.max(maxWet, e); sqWet += e * e; nWet++; }
		}
	return { max: +max.toFixed(4), maxAt: at, rms: +Math.sqrt(sq / a.length).toFixed(5),
		maxWet: +maxWet.toFixed(4), rmsWet: +Math.sqrt(sqWet / nWet).toFixed(5),
		cellsOver10cm: over10cm, cells: a.length };
}

let t = performance.now();
const fine = bathyFromPolyline(JBAY.coast, { nx: NX, ny: NY, dx: 2.5, origin: [-998.75, -2898.75], rotationDeg: 0 }, JBAY_RECIPE);
const fineMs = performance.now() - t;
console.log('full-res 960x2560 vs depth.f32', JSON.stringify(compare(fine.depth, ref, NX, NY, -998.75, -2898.75, 2.5)), `${fineMs.toFixed(0)} ms`);

const refC = blockMean(ref, NX, NY, 5, 5);
const ownC = blockMean(fine.depth, NX, NY, 5, 5);
console.log('block-mean of our full-res vs block-mean of Run A', JSON.stringify(compare(ownC, refC, 192, 512, JBAY_GRID.origin[0], JBAY_GRID.origin[1], 12.5)));

t = performance.now();
const coarse = bathyFromPolyline(JBAY.coast, JBAY_GRID, JBAY_RECIPE);
const coarseMs = performance.now() - t;
console.log('Run C grid point-sampled vs Run A block mean', JSON.stringify(compare(coarse.depth, refC, 192, 512, JBAY_GRID.origin[0], JBAY_GRID.origin[1], 12.5)), `${coarseMs.toFixed(0)} ms`);

t = performance.now();
const ss = bathyFromPolyline(JBAY.coast, JBAY_GRID, JBAY_RECIPE, {}, { supersample: 5 });
const ssMs = performance.now() - t;
console.log('Run C grid supersample 5 vs Run A block mean', JSON.stringify(compare(ss.depth, refC, 192, 512, JBAY_GRID.origin[0], JBAY_GRID.origin[1], 12.5)), `${ssMs.toFixed(0)} ms`);

# sim

A browser shallow-water surf solver (WebGPU) and the bathymetry builder that
feeds it. Frames and sign conventions: [FRAME.md](FRAME.md). Accuracy against
the reference run: [PARITY.md](PARITY.md).

| file | what |
|---|---|
| `bathy.ts` | `bathyFromPolyline(coast, grid, recipe, overrides?, opts?)`: depth grid from an ENU coastline; `CoastIndex`, the segment hierarchy behind it |
| `swell.ts` | `Swell` (Hs, Tp, compass direction, spread), JONSWAP components, angle conversions |
| `config.ts` | `SolverOptions`, defaults, `breakingDefaults`, `suggestDt`, uniform packing |
| `common.wgsl` | uniforms, bindings and `finish`: friction, foam, breaking, wavemaker, sponges |
| `muscl.wgsl` | scheme `'muscl'` (default): MUSCL-MC + Audusse + HLL, SSP-RK2 as two dispatches per step (Run A's core) |
| `step.wgsl` | scheme `'first-order'`: Run C's single-stage HLL + Audusse |
| `fields.wgsl` | post-step passes: pack the state into a texture, accumulate Hs and foam statistics |
| `solver.ts` | `createSolver(device, options)`: the WebGPU module |
| `cpu.ts` | `createCpuSolver(options)`: both schemes on the CPU, for tests and parity |
| `debug.wgsl`, `debug-render.ts` | a plain diagnostic painter (eta colour map, foam white, land brown) |
| `gpu.ts` | `requestDevice()` with a retry for slow GPU-process start-up |

## Use

```ts
import { bathyFromPolyline, JBAY_RECIPE } from '#lib/sim/bathy.ts';
import { createSolver } from '#lib/sim/solver.ts';
import { createDebugRenderer } from '#lib/sim/debug-render.ts';
import { requestDevice } from '#lib/sim/gpu.ts';
import { jbayGrid } from '#lib/spots/jbay.ts';

const grid = jbayGrid(6.25); // 384 x 1024 cells
const { depth } = bathyFromPolyline(coastEnu, grid, JBAY_RECIPE, { shelfWidth: 180 });
const { device } = await requestDevice();
const solver = createSolver(device, {
	nx: grid.nx, ny: grid.ny, dx: grid.dx, depth,
	swell: { Hs: 2.5, Tp: 15, dirDeg: 120, spread: 20 },
	rotationDeg: grid.rotationDeg,
	wavemaker: { width: 75 / grid.dx }, // keep the band and sponges the same in metres
	sponge: { width: 150 / grid.dx }
});
const painter = createDebugRenderer(solver, canvas);

function frame() {
	solver.step(); // options.substeps steps of params.dt
	painter.draw();
	requestAnimationFrame(frame);
}
```

The solver draws nothing itself. A renderer reads `solver.fields`, an
`rgba16float` texture of width nx and height ny whose texel `(ix, iy)` holds
`(eta, h, foam, zb)`, refreshed at the end of every `step()`. `solver.buffers`
exposes the raw state for compute-side consumers, `solver.device` the device.

`setSwell()` changes the forcing without a restart (the dial). `setDepth()`
swaps the bathymetry and resets to still water (a new spot). `readEta()`,
`readFoam()` and `readState()` copy fields back to the CPU. `startStats()` then
`readStats()` give per-cell Hs and foam statistics, the basis for "is this spot
working".

### Choosing dx, dt and the scheme

| | J-Bay vs Run A | cells (6.4 x 2.4 km) | 4090, 600 s of model time |
|---|---|---|---|
| `muscl`, 6.25 m | interior Hs 91 %, all 8 sections break | 393 k | 0.44 s |
| `muscl`, 12.5 m | interior Hs 79 %, 6 of 8 break | 98 k | 0.31 s |
| `first-order`, 12.5 m | interior Hs 10 %, nothing breaks | 98 k | 0.30 s |

6.25 m is the recommended default; 12.5 m is the fallback for weak GPUs. `dt`
defaults to Courant 0.4 at the deepest cell (`suggestDt`), 0.126 s at 6.25 m on
J-Bay. Watching in real time needs about 8 steps per second at that dt; the
`/sim` page steps by elapsed time (`?speed=` model seconds per real second).

Breaking defaults (`breakingDefaults`) follow Run A, depth below 5 m and
steepness above 0.40 or Froude above a grid-scaled threshold
`0.65 - 0.024 dx` (0.50 at 6.25 m, 0.35 at 12.5 m).

## Map overlay (map-kit)

map-kit's `<Overlay mode="webgpu">` owns the device and the configured canvas
context. Create the solver on that device and give the painter the context;
neither is configured or destroyed here.

```ts
import { coastlineNear } from '@dan-slater/map-kit';
import { createDebugRenderer, affineFromOverlay } from '#lib/sim/debug-render.ts';

async function onready(frame: OverlayFrame) {
	const device = frame.gpu!.device as GPUDevice;
	const context = frame.gpu!.context as GPUCanvasContext;
	const format = frame.gpu!.format as GPUTextureFormat;
	const coast = await coastlineNear(frame.map, { lon, lat, radiusMeters: 4000, classes: ['ocean'] });
	const grid = /* a GridSpec in coast.frame's ENU metres, land on the low-ix side (FRAME.md) */;
	const { depth } = bathyFromPolyline(coast.polylines.map((p) => p.points), grid, JBAY_RECIPE, {}, { oceanSide: 'left' });
	solver = createSolver(device, { nx: grid.nx, ny: grid.ny, dx: grid.dx, depth, swell, rotationDeg: grid.rotationDeg });
	painter = createDebugRenderer(solver, { context, format });
}

function ondraw(frame: OverlayFrame) { // with <Overlay continuous>
	solver.step();
	painter.setAffine(affineFromOverlay(grid, coast.frame, frame));
	painter.draw();
}
```

`affineFromOverlay` maps three grid corners through `toLonLat` and `project`
and treats the map as affine across the domain. map-kit's own docs recommend
this; it stops being exact under globe curvature, which is far below a pixel
over a few kilometres at the zoom a spot is viewed at.

Choosing the grid from a clicked coast (orientation so the land is on the
low-ix side, rotation from the local coast direction) is step 3's job.

## Known limits

At 12.5 m the scheme still loses about 20 % of the swell height between the
wavemaker and the surf zone, and breaking is depth-limited bores (NSWE has no
dispersion; Run A has the same limit). See PARITY.md.

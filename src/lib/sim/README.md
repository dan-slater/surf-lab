# sim

A browser shallow-water surf solver (WebGPU) and the bathymetry builder that
feeds it. Frames and sign conventions: [FRAME.md](FRAME.md). Accuracy against
the reference run: [PARITY.md](PARITY.md).

| file | what |
|---|---|
| `bathy.ts` | `bathyFromPolyline(coast, grid, recipe, overrides?, opts?)`: depth grid from an ENU coastline |
| `swell.ts` | `Swell` (Hs, Tp, compass direction, spread), JONSWAP components, angle conversions |
| `config.ts` | `SolverOptions`, Run C defaults, `suggestDt`, uniform packing |
| `step.wgsl` | the time step: first-order HLL + Audusse, Manning, foam, wavemaker, sponges |
| `fields.wgsl` | post-step passes: pack the state into a texture, accumulate Hs and foam statistics |
| `solver.ts` | `createSolver(device, options)`: the WebGPU module |
| `cpu.ts` | `createCpuSolver(options)`: the same scheme on the CPU, for tests and parity |
| `debug.wgsl`, `debug-render.ts` | a plain diagnostic painter (eta colour map, foam white, land brown) |
| `gpu.ts` | `requestDevice()` with a retry for slow GPU-process start-up |

## Use

```ts
import { bathyFromPolyline, JBAY_RECIPE } from '#lib/sim/bathy.ts';
import { createSolver } from '#lib/sim/solver.ts';
import { createDebugRenderer, affineFromProjection } from '#lib/sim/debug-render.ts';
import { requestDevice } from '#lib/sim/gpu.ts';

const grid = { nx: 192, ny: 512, dx: 12.5, origin: [-993.75, -2893.75], rotationDeg: 0 };
const { depth } = bathyFromPolyline(coastEnu, grid, JBAY_RECIPE, { shelfWidth: 180 });
const { device } = await requestDevice();
const solver = createSolver(device, {
	nx: grid.nx, ny: grid.ny, dx: grid.dx, depth,
	swell: { Hs: 2.5, Tp: 15, dirDeg: 120, spread: 20 },
	rotationDeg: grid.rotationDeg
});
const painter = createDebugRenderer(device, canvas, solver);
// in a map overlay: painter.setAffine(affineFromProjection(grid, enuToPixel, canvas.width, canvas.height))

function frame() {
	solver.step();      // options.substeps steps of options.dt
	painter.draw();
	requestAnimationFrame(frame);
}
```

The solver draws nothing itself. A renderer reads `solver.fields`, an
`rgba16float` texture of width nx and height ny whose texel `(ix, iy)` holds
`(eta, h, foam, zb)`, refreshed at the end of every `step()`. `solver.buffers`
exposes the raw state for compute-side consumers.

`setSwell()` changes the forcing without a restart (the dial). `setDepth()`
swaps the bathymetry and resets to still water (a new spot). `readEta()`,
`readFoam()` and `readState()` copy fields back to the CPU. `startStats()` then
`readStats()` give per-cell Hs and foam statistics, the basis for "is this spot
working".

The grid size, dx and dt are inputs. `suggestDt(maxDepth, dx)` gives a stable
step; Run C's 0.12 s suits 12.5 m cells up to about 40 m deep.

## Map overlay contract (map-kit)

map-kit's overlay supplies a canvas, `project`/`unproject` and
`enuFrame(lat0, lon0)`. Convert the clicked coast to ENU with `enuFrame`, choose
a `GridSpec` with land on the low-ix side (FRAME.md), build the depth, and give
the painter an affine from `affineFromProjection(grid, (x, y) =>
project(enuFrame.toLonLat(x, y)), w, h)`. The function name on map-kit's side
is a guess until that package lands.

## Known limit

The scheme is first order, as Run C was. At 12.5 m it damps a 15 s swell with an
e-folding distance of about 265 m, so on J-Bay's grid almost nothing reaches the
surf zone and nothing breaks. PARITY.md has the numbers; HANDOVER.md has what
MUSCL + RK2 would take.

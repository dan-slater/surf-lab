# sim

A browser shallow-water surf solver (WebGPU) and the bathymetry builder that
feeds it. Frames and sign conventions: [FRAME.md](FRAME.md). Accuracy against
the reference run: [PARITY.md](PARITY.md).

| file | what |
|---|---|
| `bathy.ts` | `bathyFromPolyline(coast, grid, recipe, overrides?, opts?)`: depth grid from an ENU coastline; `CoastIndex`, the segment hierarchy behind it |
| `grid.ts` | `gridFromCoast(polylines, opts)`: place a GridSpec on any coastline (FRAME.md) |
| `swell.ts` | `Swell` (Hs, Tp, compass direction, spread), JONSWAP components, angle conversions, `generatorDirection` (forecast deep-water direction to wavemaker direction) |
| `config.ts` | `SolverOptions`, defaults, `breakingDefaults`, `suggestDt`, uniform packing |
| `common.wgsl` | uniforms, bindings and `finish`: friction, foam, breaking, wavemaker, sponges |
| `muscl.wgsl` | scheme `'muscl'` (default): MUSCL-MC + Audusse + HLL, SSP-RK2 as two dispatches per step (Run A's core) |
| `step.wgsl` | scheme `'first-order'`: Run C's single-stage HLL + Audusse |
| `fields.wgsl` | post-step passes: pack the state into a texture, accumulate Hs and foam statistics |
| `solver.ts` | `createSolver(device, options)`: the WebGPU module |
| `cpu.ts` | `createCpuSolver(options)`: both schemes on the CPU, for tests and parity |
| `budget.ts` | `Governor`: steps per frame within a GPU budget (`solver.budget`) |
| `render/` | the product renderer, front tracking and surfers (below) |
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

## The product renderer (`render/`)

| file | what |
|---|---|
| `renderer.ts`, `water.wgsl` | `createRenderer(solver, { context, format, affine, theme?, pixelRatio?, rotationDeg?, look? })`: the sea in one full-screen pass |
| `theme.ts` | `Theme` tokens (ink, ink2, land, coast, teal, tealHi, foam, accent, sand), `DEFAULT_THEME`, `themeFromCss(el)` |
| `view.ts` | `viewAffine(grid, { center, metersAcross, upDeg }, w, h)` and `viewToPixel`: a camera for a page canvas |
| `fronts.ts`, `fronts.wgsl` | `createFrontTracker(solver, grid)`: breaking fronts for surfers, `.fronts()` |
| `rig.ts` | the P6 stick figure: poses, IK legs, `drawRig`, `drawSitter` |
| `surfers.ts` | `createSurfers({ zones, depth, grid, count, seed })`: the crowd, `.update()` and `.draw()` |

```ts
const solver = createSolver(device, { ...grid, depth, swell: { ...swell, groupiness: 0.6, groupWaves: 8 } });
solver.rampFrom(0);                                    // the spot builds from flat over 20 s
const renderer = createRenderer(solver, { context, format, affine, pixelRatio, theme });
renderer.setHs(swell.Hs);
const tracker = createFrontTracker(solver, grid);
const crowd = createSurfers({ zones: sectionPoints, depth, grid, count: 8, seed: 7 });
const budget = solver.budget(16.7);                    // one 60 fps frame

function frame(realDt: number) {
	const t0 = solver.time;
	budget.frame(realDt * speed, realDt, () => {          // steps within the budget, then draws
		renderer.draw(solver.time);
		tracker.update();
	});
	crowd.update(solver.time - t0, realDt, tracker.fronts());
	ctx2d.clearRect(0, 0, w, h);                         // a 2d canvas layered over the WebGPU one
	crowd.draw(ctx2d, toPx, pxPerMeter, theme);
	if (budget.level === 'coarser-grid') rebuildAt(coarserDx(grid.dx));
}
```

**The sea.** A full-screen triangle; each pixel maps back to grid coordinates
through the inverse of `affine`, so the canvas is covered past the grid edge
(motion fades out over 24 cells). Eta is reconstructed with a cubic B-spline
(C2, so slopes do not facet at cell edges). The water is tinted from ink
(deep) to ink2 and a touch of teal (shallow), lit through the slope by a
light from the land side, so shoreward faces catch light and backs fall into
shadow. Crest lines are drawn where eta peaks along the local flow; the ridge
is a parabola fit over plus and minus 2 cells, because the MUSCL solution
carries about 8 mm of grid-scale ripple that bends a 1-cell fit. Depth
contours at 3, 10 and 20 m are faint chart lines. Land is flat theme colour
with topo lines every 4 m, a wet-sand band and a coastline stroke. The look
follows the approved wave-landing page; its tokens match the book palette.

**Foam as line art.** Three iso-lines of the smoothed foam scalar (0.15,
0.40, 0.75), so fresh whitewater has nested outlines and decaying foam one
fading one, plus fine streaks on a jittered lattice, oriented and carried by
the flow, more and longer where the foam is fresh. `look` tunes widths,
density and opacity.

**Fronts.** Per along-shore row, a GPU pass finds the seaward edge of fresh
foam (32 bytes a row are read back, every 0.25 model s). On the CPU, rows
form broken sections (gaps under 20 m bridged, at least 30 m long); section
ends are tracked with a least-squares velocity over 1.5 s. An end that has
lived 1 s and runs along shore away from its section at 2 to 20 m/s is a peel.
Each `Front` has ENU `x, y`, unit `dir`, `speed`, `age`, `peeling`, `depth`,
`waveDir`, the peel angle `alpha`, the P4 `vp = c / sin(alpha)` and
`makeable` (`vp` at most 11 m/s).

**Surfers.** Lineups sit where the water is 1.8 m deep, seaward of the given
zones (a spot's sections). A surfer takes off when a makeable peel within 60 m
comes toward them; the wave carries them onto the shoulder during the 1.2 s
pop-up; they ride 10 m ahead of the front and 6 m seaward of it at up to 11
m/s, with lean from path curvature (`atan(v^2 k / g)`) and pitch from
acceleration choosing trim, bottom turn, top turn or tube. They kick out when
the front dies or stays 30 m ahead for 1.5 s, wipe out when it stops being
makeable on top of them, and paddle back round the outside. Seeded, so a
cover is reproducible. Positions move in model time, limbs in real time.
Figures are drawn far larger than life (a board is about 15 px at cover
scale), as on the landing page.

**Sets, lulls and spin-up.** `Swell.groupiness` (0 to 1) and `groupWaves`
modulate the wavemaker: a set and a lull together last `2 x groupWaves x Tp`.
`solver.rampFrom(level, { seconds = 20, clock = 'real' })` scales the forcing
up from `level`.

**Budget.** `solver.budget(ms)` returns `{ frame, level, governor }`. It plans
steps from the measured cost per step and per render, and also cuts its step
cap when frames arrive more than 25 % late. Levels: `ok`, `slow-motion` (fewer
steps than the speed asks for: the sea slows down), `coarser-grid` (one step
and a render no longer fit for 3 s: rebuild at `coarserDx(dx)`). Without GPU
timestamp queries the per-step timings are upper bounds (they include a
millisecond or two of round trip), which only makes it cautious on fast GPUs.

Measured on the 4090 (`scripts/bench.ts`): a 6.25 m J-Bay step 0.083 ms, a
12.5 m step 0.048 ms, render plus tracker 0.27 to 0.34 ms a frame from 1.2 to
3.7 Mpx. A cover frame at 10x speed is about 0.45 ms of GPU time.

Dev route: `/sim/cover` (query keys at the top of the file: `warm`, `speed`,
`dx`, `across`, `up`, `cx`, `cy`, `foam`, `surfers`, `seed`, `groupiness`,
`groupWaves`, `ramp`, `budget`, `fronts`, `rig`, `bench`, `hud`). Frames are in
`docs/img/render/`.

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
	const lines = coast.polylines.map((p) => p.points);
	grid = gridFromCoast(lines, { dx: 6.25, oceanSide: 'left' }).grid;
	const { depth } = bathyFromPolyline(lines, grid, JBAY_RECIPE, {}, { oceanSide: 'left' });
	// the forecast gives a deep-water direction; the wavemaker wants the local one
	const dir = generatorDirection(forecast.dirDeg, grid, wavemakerDepth(depth, grid.nx, grid.ny, 12), { Tp: forecast.Tp });
	const swell = { Hs: forecast.Hs, Tp: forecast.Tp, dirDeg: dir.dirDeg, spread: 20 };
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

`gridFromCoast` guarantees 1 km of water in front of the middle half of the
domain; check `info.squeezed` and `info.minWater` for coasts that do not fit.

## Known limits

The sim breaks close to the shore (Run A too: 0.3 to 0.8 m of water, 10 to 30 m
out), so at a 4 km cover framing the surf zone is a thin bright band; the line
art reads from about 2 km across and closer. Peels are short bursts, so rides
last a median 3.4 model seconds over 40 m, and at 10x speed a ride is on screen
for a fraction of a second: a cover that features surfers wants 3x to 4x.


At 12.5 m the scheme still loses about 20 % of the swell height between the
wavemaker and the surf zone, and breaking is depth-limited bores (NSWE has no
dispersion; Run A has the same limit). See PARITY.md.

# ui

| file | what |
|---|---|
| `SimView.svelte` | the sim surface. Fill mode: its own canvas, grid cover-fit to the box, section labels. Map mode (`overlay` = a map-kit `OverlayFrame` in webgpu mode): draws into the overlay's context, registered to the map. A new `scene.key` builds a new solver and spins up from flat; a new `swell` only changes the forcing |
| `sim-engine.ts` | one running sim: bathymetry, solver, painter, the deep-water to wavemaker direction (`generatorDirection`), and the forcing schedule |
| `Dial.svelte` | Hs, Tp, direction, spot picker, "today", globe link, honesty line; reads and writes the store |
| `CompassDial.svelte` | a draggable, keyboard-operable compass (direction FROM) with an optional swell-window arc |
| `SpotFacts.svelte` | a spot's facts and this hour's forecast |
| `today.ts` | `applyToday()`: forecast for the store's spot, clamped to the dial ranges |

## The renderer is a placeholder

`sim-engine.ts` paints with the sim line's debug painter
(`src/lib/sim/debug-render.ts`: eta colour map, land brown). Build step 4
replaces it with face light, line-art foam and surfers; the swap is the one
`createDebugRenderer` call in `createSimEngine`, behind the same
`draw()` / `setAffine()` shape.

## Spin-up and sets are stubs

The forcing ramps from flat over `spinUpSeconds` (20 s of real time) and is
modulated into sets and lulls (8 to 12 waves per set, then a lull as long; Hs
between 45 % and 100 %) by calling `solver.setSwell` with a scaled Hs. The sim
line is adding `setSwell({ groupiness })` and `rampFrom(0)` to the solver;
when they land, `setEnvelope` and the Hs scaling in `force()` go.

## Speed

The sim runs at `speed` model seconds per real second (default 4), stepping
by elapsed time like the sim line's `/sim` page. Cell size is 6.25 m by
default and 12.5 m on small touch screens (`defaultDx()`); `?dx=12.5` forces it.

## map-kit

`@dan-slater/map-kit` is pinned to the `v0.1.0` tag (`github:...#v0.1.0`; Bun
does not understand `#semver:`). The tag's `prepare` (svelte-package) fails
under this app's SvelteKit 3 / Vite 8 even when trusted, so the app compiles
map-kit from the source the package ships (`src/lib`): `vite.config.ts`
aliases `@dan-slater/map-kit` to it and `tsconfig.json` maps the same path.
Node's subpath imports (`#...`) cannot point into `node_modules`, so the alias
is the way in.

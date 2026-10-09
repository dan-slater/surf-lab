# spots

The spot catalogue, the coastlines, and turning a spot into a sim scene.

| file | what |
|---|---|
| `spots.json` | 20 breaks as plain facts: lat/lon (4 decimals), wave type, direction and bottom, swell window (deep-water compass, clockwise from/to), a typical swell, bathymetry recipe overrides, optional pinned frame, sections, `modelNote` where the sim cannot model the spot |
| `spots.ts` | the `Spot` type, `spots`, `defaultSpot` (J-Bay), `spotBySlug`, `inWindow`, `compassName`, `customSpot` (a clicked coast, slug `here`), `rememberedSpot` / `rememberSpot` (localStorage, never throw) |
| `jbay.json`, `jbay.ts` | J-Bay's OSM coastline, its eight sections and the reference grid (shared with the sim line's parity runs) |
| `coasts/*.json` | coastlines for 16 catalogue spots, captured from OpenFreeMap tiles by `scripts/fetch-coasts.ts` |
| `coasts.ts` | `loadCoast(spot)`: J-Bay's polyline, a bundled tile coast, or a clicked coast from memory / localStorage (`putCoast`) |
| `tiles.ts` | `tileCoast(map, lon, lat)`: map-kit's `coastlineNear` plus a per-polyline water-side check against the rendered map |
| `frame.ts` | `openSea()` and `gridForCoast()`: the grid frame on a clicked coast, see [FRAME-CHOICE.md](FRAME-CHOICE.md) |
| `scene.ts` | `buildScene(spot, coast, dx)`: grid, recipe overrides and sections for one spot; `defaultDx()` |
| `load.ts` | `loadScene(spot, dx)`: coast plus scene, or a reason why not |

## Recipe overrides

`recipe` is a `BathyOverrides` (`src/lib/sim/bathy.ts`) applied over the
J-Bay recipe (1:25 land and shelf, 250 m shelf, 1:70 ramp beyond):
`shelfSlope`, `shelfWidth`, `rampSlope`, `reefAngleDeg`, `sandbar`
(`{ offset, height, width }` in metres), `maxDepth`. Reefs get a steeper,
narrower shelf; beach breaks a gentler shelf and a sandbar. The values are
modelling choices, not surveys.

J-Bay's entry has an empty `recipe` and a pinned frame
(`rotationDeg: 0`, `maxObliquityDeg: 30`, grid corner `[-1000, -2900]`), so
`buildScene` reproduces `jbayGrid(dx)` exactly (tested).

## Refreshing the coasts

With the dev server on 5182: `bun scripts/fetch-coasts.ts [slug ...]`. It
prints, per spot, how far the catalogue position is from the coast and which
way the open sea lies, which is how bad coordinates get caught. Keep it
occasional: OpenFreeMap is free and asks not to be bulk-downloaded.

Coastline data: OpenStreetMap contributors (ODbL), tiles by OpenFreeMap /
OpenMapTiles.

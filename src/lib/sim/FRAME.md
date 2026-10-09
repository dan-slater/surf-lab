# Frames and conventions

## ENU (input coordinates)

Coastlines arrive as polylines in local ENU metres: x east, y north, origin at
the spot (map-kit's `enuFrame(lat0, lon0)` produces this). J-Bay's origin is
Supertubes, lat -34.0308, lon 24.9338.

**Coast orientation:** the builder needs to know which side of each polyline
is water, judged walking the polyline in vertex order. Pass it as
`bathyFromPolyline(..., { oceanSide })`:

| source | water is on the | pass |
|---|---|---|
| OpenStreetMap coastline ways, `jbay.json` | right (land on the left) | `'right'` (default) |
| map-kit `coastlineNear` (OpenMapTiles water polygons, OGC winding) | left | `'left'` |

The wrong side produces an inverted map (sea where land should be).
`coastlineNear` returns several polylines when a river mouth breaks the coast;
pass them all as one array. Each cell takes its sign from the nearest segment,
so near the open end of a polyline (a river mouth, the edge of the query
circle) the land/sea split follows the extension of the end segment.

## Grid

`GridSpec = { nx, ny, dx, origin: [x, y], rotationDeg }`

- Cell `(ix, iy)` has its centre at
  `origin + ix * dx * (cos r, sin r) + iy * dx * (-sin r, cos r)`, with
  `r = rotationDeg` counter-clockwise from east. `origin` is the centre of
  cell (0, 0), not its corner.
- **ix runs across shore**, from land (`ix = 0`) to open water
  (`ix = nx - 1`). **iy runs along shore.** Place and rotate the grid so the
  land is on the low-ix side.
- Arrays are flat, `idx = ix * ny + iy` (iy fastest), as in Run A's
  `depth.f32` and Run C's `build_demo.py`.
- Depth is positive in water; on land it is negative (minus the elevation).
  Bed elevation `zb = -depth`.

J-Bay (`src/lib/spots/jbay.ts`): `nx 192, ny 512, dx 12.5, origin
[-993.75, -2893.75], rotationDeg 0`. With no rotation the grid is ENU-aligned:
ix is east (seaward), iy is north (along the coast, Kitchen Windows to
Albatross).

## Choosing a grid from a coast

`gridFromCoast(polylines, { dx, nx?, ny?, oceanSide?, center?, rotationDeg?, ... })`
in `grid.ts` places a `GridSpec` on any coastline and returns it with the
affines `toEnu` (grid index to ENU metres) and `fromEnu` (the inverse), plus
diagnostics. Defaults: a 2.4 x 6.4 km domain (`nx = 2400 / dx`,
`ny = 6400 / dx`), centred along shore on `center` (default `[0, 0]`, the
map-kit query point).

1. **Starting direction:** the principal axis of the coast, each segment
   weighted by its length and a Gaussian of its distance from `center`
   (`sigma`, default a quarter of the domain length). The ocean-side mean
   normal picks which way is offshore.
2. **Rotation:** turned (within 60 deg of the start) so the line where the
   wavemaker will sit runs parallel to the depth contours in front of the
   spot. Depth is a function of distance to the coast, so the rule minimises
   the spread of coast distance along that line over the **core**, the middle
   half of the domain along shore. Pass `rotationDeg` to pin a hand-chosen
   frame instead (a catalogue spot).
3. **Placement across shore:** the coast at `center` sits at `landFraction`
   (0.35) of the width from the land edge, then the grid is moved, if needed,
   to keep at least `minWater` (1000 m) between every coast point in the core
   and the wavemaker and at least `minLand` (150 m) of land behind it. If both
   cannot hold, water wins and `info.squeezed` is set.

The 1 km is guaranteed over the core only. Outside it, where the sponges
work, the coast may come closer: `info.minWater` reports the closest approach
over the whole length.

**J-Bay check.** With `center` on the Run A domain centre (200, 300) at 6.25 m,
the helper picks a rotation of 1.4 deg (the hand-chosen Run A frame is 0). Its
centre is 23 m from Run A's and its farthest corner 106 m. With `rotationDeg: 0`
pinned, every corner is within 27 m (4 cells at 6.25 m, 2 at 12.5 m); the
remaining offset is the 0.35 land fraction against Run A's 0.34. The rotation
is sensitive to how much coast it looks at: J-Bay's shore turns through about
30 deg over 6 km, and the core rule gives 1.4 to 4.5 deg depending on the
centre, while the whole-length direction is about 12 deg off. At the north end
J-Bay's coast curls toward the wavemaker line in both frames (12 m of water
left for the helper's frame, 113 m for Run A's), inside the sponge.

## Boundaries

- **Wavemaker:** a relaxation band on the `ix = nx - 1` edge, `wavemaker.width`
  cells wide (6), pulling the state toward the linear target of all swell
  components with weight `strength * (1 - band / width)` per step.
- **Sponges:** on both along-shore ends (`iy = 0` and `iy = ny - 1`),
  `sponge.width` cells (12), damping momentum and relaxing the level to rest.
- **ix = 0:** zero-gradient, normally dry land.

## Swell direction

Directions are compass directions the swell comes FROM (0 north, 90 east), the
convention of marine forecasts such as Open-Meteo's `wave_direction`. There are
two of them, and they differ:

- **deep-water direction:** what a forecast reports and what the app's state
  carries. J-Bay's regional swell is from the SW, about 225 deg.
- **generator direction:** `Swell.dirDeg`, what the solver's wavemaker makes at
  the grid's offshore edge, after refraction over the shelf. 120 deg in Run A.

`generatorDirection(deepWaterDeg, grid, depthAtWavemaker, { Tp })` in
`swell.ts` converts one to the other. It measures the deep-water angle from the
grid's shore normal (a swell from compass `90 - rotationDeg` runs straight
onshore) and refracts it with Snell's law, `sin(a) / c` constant, using linear
phase speeds for the period. A swell from 90 deg or more off the normal comes
from behind the coast, as SW swell does at east-facing J-Bay: it can only
arrive by wrapping round a headland, and is treated as arriving at grazing
incidence, which refracts to the largest angle the depth allows,
`asin(c / c0)`. The result is capped at 45 deg from the normal
(`maxObliquityDeg`); beyond that the crests run along the domain into the
sponges. For J-Bay (rotation 0, 26.4 m at the wavemaker) 225 deg at Tp 15 s
gives 129 deg, 12 s gives 139 deg, 18 s gives 123 deg. Run A's 120 deg is
30 deg off the normal, a hand choice; `maxObliquityDeg: 30` reproduces it. Use
`wavemakerDepth` in `config.ts` for the depth.

The solver works with a propagation angle `theta` in the grid frame, measured
counter-clockwise from +ix:

```
theta = 270 - dirDeg - rotationDeg      (degrees)
```

`thetaFromCompass` and `compassFromTheta` in `swell.ts` do the conversion. Run A
and Run C used `theta0 = 150` deg in the math frame with no rotation, so their
swell comes from **120 deg (ESE)**: it travels toward -x (onshore) and +y
(north, the direction J-Bay peels). The manifest notes the regional deep-ocean
swell is from the SW (225 deg); 120 deg is the local direction after it has
wrapped around Cape St Francis.

A swell whose `theta` points toward +ix (offshore) still runs, but it leaves
the domain through the wavemaker band and nothing reaches the coast. Callers
that pick a direction from a forecast should check `cos(theta) < 0`.

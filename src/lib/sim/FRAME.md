# Frames and conventions

## ENU (input coordinates)

Coastlines arrive as polylines in local ENU metres: x east, y north, origin at
the spot (map-kit's `enuFrame(lat0, lon0)` produces this). J-Bay's origin is
Supertubes, lat -34.0308, lon 24.9338.

**Coast orientation:** walking a polyline in vertex order, the ocean is on the
RIGHT. This is the OpenStreetMap coastline convention (land on the left), so
OSM ways and water-polygon outlines traced clockwise can be passed as they
are. A polyline with the wrong orientation produces an inverted map (sea where
land should be); reverse it.

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

## Boundaries

- **Wavemaker:** a relaxation band on the `ix = nx - 1` edge, `wavemaker.width`
  cells wide (6), pulling the state toward the linear target of all swell
  components with weight `strength * (1 - band / width)` per step.
- **Sponges:** on both along-shore ends (`iy = 0` and `iy = ny - 1`),
  `sponge.width` cells (12), damping momentum and relaxing the level to rest.
- **ix = 0:** zero-gradient, normally dry land.

## Swell direction

`Swell.dirDeg` is a compass direction the swell comes FROM (0 north, 90 east),
the convention of marine forecasts such as Open-Meteo's `wave_direction`.

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

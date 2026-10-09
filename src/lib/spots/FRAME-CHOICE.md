# Choosing the sim grid on a clicked coast

The solver wants its grid with land on the low-ix side and the wavemaker on
the `ix = nx - 1` edge, offshore (`src/lib/sim/FRAME.md`). On the map the
visitor clicks anywhere, so the app has to work out which way the sea is and
turn the grid to face it. This note records how, and why each step exists.
Code: `src/lib/spots/tiles.ts`, `frame.ts`, `scene.ts`.

## 1. Read the coast from the tiles

`/map` flies to the click at zoom 14 and calls map-kit's
`coastlineNear(map, { lon, lat, radiusMeters: 2000, classes: ['ocean'] })`.
The result is a set of ENU polylines about the click (map-kit's `enuFrame`),
so the click is the origin of the domain's coordinates.

Catalogue spots use the same reader once, offline, at zoom 13 with a 3.5 km
radius (`scripts/fetch-coasts.ts`), because their domain is 6.4 km along
shore; a click's domain is 4 km (`CLICK_DOMAIN` in `scene.ts`), matching the
2 km query. J-Bay keeps its OSM polyline and the hand-placed reference grid.

## 2. Check which side the water is on

map-kit v0.1.0 documents "water on the left" of every polyline. Measured on
2026-10-09 against the rendered map, the water was on the **right** for every
polyline at all 18 catalogue spots that returned a coast and at Durban (a test click).
Following the documented side inverts the seabed: land where the sea is,
and a wavemaker inland.

So `tiles.ts` does not trust the convention. For each polyline it takes 11
segments, steps 4 screen pixels to each side, and asks
`map.queryRenderedFeatures` whether that point is ocean water. The majority
decides; polylines with the water on the right are reversed. A polyline that
cannot be probed (off screen, or both sides alike, as on a cliff edge) follows
the majority of the others, or is reversed when none could be probed. After
this, every coast the app holds has the water on the left, and the bathymetry
builder is told so (`oceanSide: 'left'`).

## 3. Measure the open sea

`openSea()` in `frame.ts` casts 72 rays from the click (every 5 deg) out to
1.8 km and scores each by the mean signed distance to the coast along it,
positive in water. A ray straight out to sea gains distance fastest; one
running along the shore stays near it; one into a harbour or estuary meets
land. Scores are smoothed over +-15 deg. The winner is the open-sea direction.

An earlier version scored rays by how much of them was wet. It picked rays
running parallel to the shore (Uluwatu came out facing NE); distance from the
coast fixed that.

## 4. Place the grid, and guard it

`gridFromCoast` (the sim line's, `src/lib/sim/grid.ts`) places the grid: the
principal axis of the nearby coast, then a rotation within 60 deg that keeps
the wavemaker line parallel to the depth contours, then a cross-shore
placement that keeps 1 km of water in front of the core. That is the right
frame for a clean coast and is used as it is.

It can be misled by enclosed water near the click. At Durban the harbour's
shoreline is ocean-classed and sits inside the 2 km radius; on its own, and
with the documented orientation, the grid came out pointing up the harbour.
So `gridForCoast()` compares the grid's offshore axis with the open-sea
direction from step 3 and, if they differ by more than 60 deg, places the grid
again with its rotation pinned to the open-sea direction. `scene.guarded`
records when that happened.

Over the 16 bundled tile coasts the guard never fires: the chosen offshore
axis is within 25 deg of the open-sea direction at 14 of them, 37 deg at
Mundaka (an estuary mouth) and 46 deg at Mavericks (a reef off a curved
headland). `spots.test.ts` checks every one stays within 60 deg. It did fire
at Skeleton Bay, whose catalogue position is in doubt (below).

## 5. Default swell for a clicked coast

Until the forecast for the click arrives, a clicked coast gets a swell from
the grid's offshore bearing (`offshoreBearing(grid)`), straight onshore. The
forecast's deep-water direction then replaces it, and the sim refracts it to
the wavemaker with `generatorDirection`; a swell from behind the coast is sent
in at the steepest angle the shelf allows.

## Known gaps

- `info.squeezed` is common on clicked coasts: with a 2.4 km cross-shore width,
  1 km of water in front of the core and a curved coast, the land margin
  behind the beach goes. Water wins, which is the right trade for the sim.
- Reefs far from land cannot be modelled from a coastline (Cloudbreak is
  about 3 km from Tavarua). The catalogue says so in `modelNote`.
- Positions checked against the tiles (`scripts/fetch-coasts.ts`). On
  2026-10-09 three were moved from town or island centres to the break:
  Skeleton Bay to -22.9376, 14.4175 (Surfertoday, Pelican Point spit; was 1.3 km
  inland), Lance's Right to -2.3756, 99.8596 (mondo.surf, south Sipora; the old
  point was the island centroid with no ocean coast within 3.5 km) and
  Teahupo'o to -17.8656, -149.2533 (University of Hawai'i surf-spot table,
  matches surf-forecast's rounded figure; the old point was the village).
  Pasta Point and Punta de Lobos stay: each is within 0.9 km of mondo.surf's
  figure and within 330 m of the coast. Every spot now sits within 600 m of
  the coast; Teahupo'o is 584 m offshore because it breaks on the reef.
- Two open-sea bearings disagree with their swell windows: Skeleton Bay faces
  320 deg at the spit tip (window 190 to 240) and Lance's Right faces 55 deg
  (window 180 to 250). The wavemaker direction still comes from
  `generatorDirection`, but a pinned `rotationDeg` per spot may read better.
- Teahupo'o's capture carries thin inland water features (rivers) that the
  sim treats as sea.

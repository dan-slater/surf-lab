# state

One Svelte 5 runes store, `app`, exported from `index.ts`.

```ts
import { app, setSpot, setSwell, setChrome } from '#lib/state/index.ts';
```

```ts
interface AppState {
	spot: Spot; // src/lib/spots/spots.ts; slug 'here' for a coast clicked on the map
	swell: { Hs: number; Tp: number; dirDeg: number };
	source: 'dial' | 'today' | 'spot-default';
	chrome: boolean;
}
```

| field | meaning |
|---|---|
| `spot` | the spot on screen. Catalogue spots come from `spots.json`; a map click makes a custom spot (`customSpot()`, slug `here`) whose coastline is kept by `putCoast` in `src/lib/spots/coasts.ts` |
| `swell.Hs` | significant wave height, metres |
| `swell.Tp` | period, seconds (the forecast's swell mean period stands in for the peak period) |
| `swell.dirDeg` | **deep-water** compass direction the swell comes FROM, degrees (the forecast's number). The sim turns it into a wavemaker direction for the coast with `generatorDirection`; consumers never do that themselves |
| `source` | `'spot-default'` (the catalogue's typical swell), `'today'` (Open-Meteo, this hour) or `'dial'` (the visitor moved a control) |
| `chrome` | the dial is showing. The cover hides it after 10 s idle |

Rules:

- Read fields directly (`app.swell.Hs`); they are reactive in components and `$effect`s.
- Write through the setters. `setSpot(spot)` also resets the swell to the
  spot's default and remembers the spot in localStorage; `setSwell(partial,
  source)` merges.
- Call `restore()` once on mount in the browser to load the remembered spot.
  The server render and the first client render use the default spot (J-Bay).

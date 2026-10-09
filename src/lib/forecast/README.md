# forecast

Today's swell per spot from the [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api)
(free, no key; data CC BY 4.0, credited as "Open-Meteo" wherever it is shown).

```ts
import { todayFor, todayForAll } from '#lib/forecast/index.ts';

const t = await todayFor({ slug: 'jeffreys-bay', lat: -34.0308, lon: 24.9338 });
// { Hs: 1.44, Tp: 9.65, dirDeg: 204, at: '2026-10-09T10:00', partition: 'swell' } or null
const all = await todayForAll(spots); // same order as the input
```

- **One request for many spots.** `latitude` and `longitude` are
  comma-separated lists (up to `BATCH` = 50 points per request); the response
  is an array in the same order.
- **Variables:** `swell_wave_height`, `swell_wave_period`,
  `swell_wave_direction`, `wave_height`, `wave_period`, `wave_direction`,
  hourly, `timezone=auto`, one day.
- **`Today`:** the current local hour at the point. `Hs`, `Tp`, `dirDeg` come
  from the swell partition; when it is missing they fall back to the total
  sea (`partition: 'sea'`). `Tp` is the swell's mean period standing in for
  the peak period. `dirDeg` is a deep-water compass direction the swell comes
  from, which is what the store holds.
- **Cache:** memory and localStorage, keyed by spot (slug and position) and
  valid until the spot's own local date changes, so one fetch per spot per
  day. Concurrent callers share one in-flight request. A failed request gives
  `null`, never a throw.
- **Grid snapping:** the model answers for its nearest sea cell (Mundaka
  snaps about 15 km north); `DaySeries.gridLat/gridLon` record where.

`open-meteo.ts` is the pure part (URL, parsing, hour picking);
`open-meteo.test.ts` runs it against responses recorded on 2026-10-09 in
`fixtures/`.

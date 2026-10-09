/** "Today": pull the forecast for the current spot into the store. */
import { todayFor, type Today } from '../forecast/index';
import { app, setSwell } from '../state/index';

export const DIAL = {
	Hs: { min: 0.5, max: 6, step: 0.1 },
	Tp: { min: 6, max: 20, step: 0.5 }
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Fetch this hour's swell for the store's spot and apply it. Returns null when unavailable. */
export async function applyToday(): Promise<Today | null> {
	const s = app.spot;
	const t = await todayFor({ slug: s.slug, lat: s.lat, lon: s.lon });
	if (!t || app.spot.slug !== s.slug || app.spot.lat !== s.lat) return t;
	setSwell(
		{
			Hs: Math.round(clamp(t.Hs, DIAL.Hs.min, DIAL.Hs.max) * 10) / 10,
			Tp: Math.round(clamp(t.Tp, DIAL.Tp.min, DIAL.Tp.max) * 2) / 2,
			dirDeg: Math.round(t.dirDeg)
		},
		'today'
	);
	return t;
}

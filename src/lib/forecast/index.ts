/**
 * Today's swell per spot, from Open-Meteo Marine, built for many spots at
 * once: uncached spots are batched into as few requests as possible, each
 * spot's day is cached in memory and localStorage until its local date
 * changes, and concurrent callers share one request.
 */
import { localDate, marineUrl, parseMarine, pickHour, type DaySeries, type LatLon, type Today } from './open-meteo';

export type { Today, DaySeries } from './open-meteo';
export { marineUrl, parseMarine, pickHour } from './open-meteo';

/** anything with a stable key and a position: catalogue spots and custom coasts */
export interface ForecastPoint extends LatLon {
	slug: string;
}

/** points per request; Open-Meteo accepts long lists but keep URLs modest */
export const BATCH = 50;

const memory = new Map<string, DaySeries>();
const inflight = new Map<string, Promise<DaySeries | null>>();
const key = (p: ForecastPoint) => `surflab:forecast:${p.slug}@${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

type Fetcher = (url: string) => Promise<Response>;
let fetcher: Fetcher = (url) => fetch(url);
let clock = () => Date.now();

/** For tests: swap the network and the clock. */
export function _setTransport(f: Fetcher, now: () => number = () => Date.now()) {
	fetcher = f;
	clock = now;
	memory.clear();
	inflight.clear();
}

function fresh(s: DaySeries | undefined): s is DaySeries {
	return !!s && s.date === localDate(clock(), s.utcOffset);
}

function cached(p: ForecastPoint): DaySeries | undefined {
	const k = key(p);
	const m = memory.get(k);
	if (fresh(m)) return m;
	try {
		const raw = localStorage.getItem(k);
		if (raw) {
			const s = JSON.parse(raw) as DaySeries;
			if (fresh(s)) {
				memory.set(k, s);
				return s;
			}
			localStorage.removeItem(k);
		}
	} catch {
		// no storage (SSR, private mode): memory only
	}
	return undefined;
}

function store(p: ForecastPoint, s: DaySeries) {
	const k = key(p);
	memory.set(k, s);
	try {
		localStorage.setItem(k, JSON.stringify(s));
	} catch {
		// quota or private mode
	}
}

async function fetchBatch(points: ForecastPoint[]): Promise<void> {
	const res = await fetcher(marineUrl(points));
	if (!res.ok) throw new Error(`Open-Meteo marine: HTTP ${res.status}`);
	const series = parseMarine(await res.json());
	if (series.length !== points.length) throw new Error(`Open-Meteo marine: asked for ${points.length} points, got ${series.length}`);
	points.forEach((p, i) => store(p, series[i]));
}

/** Day series for every point, fetching only what is missing, in batches. */
export async function seriesForAll(points: ForecastPoint[]): Promise<(DaySeries | null)[]> {
	const need = points.filter((p) => !cached(p) && !inflight.has(key(p)));
	const unique = [...new Map(need.map((p) => [key(p), p])).values()];
	for (let i = 0; i < unique.length; i += BATCH) {
		const batch = unique.slice(i, i + BATCH);
		const req = fetchBatch(batch);
		for (const p of batch) {
			const k = key(p);
			const pr = req.then(
				() => memory.get(k) ?? null,
				(e) => {
					console.warn(e);
					return null;
				}
			);
			inflight.set(k, pr);
			pr.finally(() => inflight.delete(k));
		}
	}
	return Promise.all(points.map((p) => cached(p) ?? inflight.get(key(p)) ?? Promise.resolve(null)));
}

/** The swell this hour at each point (null where the forecast is unavailable). */
export async function todayForAll(points: ForecastPoint[]): Promise<(Today | null)[]> {
	const all = await seriesForAll(points);
	const now = clock();
	return all.map((s) => (s ? pickHour(s, now) : null));
}

export async function todayFor(point: ForecastPoint): Promise<Today | null> {
	return (await todayForAll([point]))[0];
}

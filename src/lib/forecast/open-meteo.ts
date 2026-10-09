/**
 * Open-Meteo Marine API: request building and response parsing, no I/O.
 * https://open-meteo.com/en/docs/marine-weather-api (free, no key; data
 * CC BY 4.0, credit "Open-Meteo").
 *
 * One request carries many points: latitude and longitude are
 * comma-separated lists and the response is then a JSON array in the same
 * order. A single point returns a bare object.
 */

export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export const HOURLY = [
	'swell_wave_height',
	'swell_wave_period',
	'swell_wave_direction',
	'wave_height',
	'wave_period',
	'wave_direction'
] as const;

type HourlyVar = (typeof HOURLY)[number];

export interface LatLon {
	lat: number;
	lon: number;
}

/** One point's hourly series for one local day. */
export interface DaySeries {
	/** local date at the point, YYYY-MM-DD */
	date: string;
	/** seconds east of UTC at the point */
	utcOffset: number;
	timezone: string;
	/** grid cell the model actually answered for (it snaps to the nearest sea cell) */
	gridLat: number;
	gridLon: number;
	/** local times, YYYY-MM-DDTHH:00 */
	time: string[];
	hourly: Record<HourlyVar, (number | null)[]>;
}

/** The swell for one hour, in the store's terms. */
export interface Today {
	/** significant height (m): swell partition, else total sea */
	Hs: number;
	/** period (s): swell mean period, else total sea mean period. Used as Tp */
	Tp: number;
	/** compass direction the swell comes FROM (deg) */
	dirDeg: number;
	/** local hour this is for, YYYY-MM-DDTHH:00 */
	at: string;
	/** 'swell' when the swell partition was available, 'sea' when it fell back to total waves */
	partition: 'swell' | 'sea';
}

export function marineUrl(points: LatLon[], base = MARINE_URL): string {
	const q = new URLSearchParams({
		latitude: points.map((p) => p.lat.toFixed(4)).join(','),
		longitude: points.map((p) => p.lon.toFixed(4)).join(','),
		hourly: HOURLY.join(','),
		timezone: 'auto',
		forecast_days: '1'
	});
	return `${base}?${q}`;
}

interface RawPoint {
	latitude: number;
	longitude: number;
	utc_offset_seconds: number;
	timezone: string;
	hourly: Record<string, (number | string | null)[]>;
}

/** Parse a marine response (one object or an array) into one DaySeries per point, in request order. */
export function parseMarine(json: unknown): DaySeries[] {
	const list = (Array.isArray(json) ? json : [json]) as RawPoint[];
	return list.map((p, i) => {
		if (!p || typeof p !== 'object' || !p.hourly || !Array.isArray(p.hourly.time)) {
			throw new Error(`marine response point ${i} has no hourly data`);
		}
		const time = p.hourly.time as string[];
		const hourly = {} as DaySeries['hourly'];
		for (const v of HOURLY) {
			const col = p.hourly[v];
			hourly[v] = time.map((_, k) => {
				const x = Array.isArray(col) ? col[k] : null;
				return typeof x === 'number' && Number.isFinite(x) ? x : null;
			});
		}
		return {
			date: time[0]?.slice(0, 10) ?? '',
			utcOffset: p.utc_offset_seconds ?? 0,
			timezone: p.timezone ?? 'GMT',
			gridLat: p.latitude,
			gridLon: p.longitude,
			time,
			hourly
		};
	});
}

/** Local wall-clock time at a UTC offset, as YYYY-MM-DDTHH:MM */
export function localTime(nowMs: number, utcOffset: number): string {
	return new Date(nowMs + utcOffset * 1000).toISOString().slice(0, 16);
}

/** The local date at a point right now. */
export function localDate(nowMs: number, utcOffset: number): string {
	return localTime(nowMs, utcOffset).slice(0, 10);
}

/**
 * The swell for the current local hour, or null when the series does not
 * cover it (a stale day) or the point has no data (a land cell).
 */
export function pickHour(series: DaySeries, nowMs: number): Today | null {
	const hour = localTime(nowMs, series.utcOffset).slice(0, 13);
	const k = series.time.findIndex((t) => t.slice(0, 13) === hour);
	if (k < 0) return null;
	const h = series.hourly;
	const sH = h.swell_wave_height[k], sT = h.swell_wave_period[k], sD = h.swell_wave_direction[k];
	if (sH !== null && sT !== null && sD !== null && sH > 0) {
		return { Hs: sH, Tp: sT, dirDeg: sD, at: series.time[k], partition: 'swell' };
	}
	const wH = h.wave_height[k], wT = h.wave_period[k], wD = h.wave_direction[k];
	if (wH !== null && wT !== null && wD !== null) {
		return { Hs: wH, Tp: wT, dirDeg: wD, at: series.time[k], partition: 'sea' };
	}
	return null;
}

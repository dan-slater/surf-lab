import { describe, expect, test } from 'bun:test';
import two from './fixtures/marine-2-spots.json';
import one from './fixtures/marine-1-spot.json';
import { marineUrl, parseMarine, pickHour } from './open-meteo';
import { _setTransport, todayFor, todayForAll } from './index';

// Fixtures recorded 2026-10-09 from marine-api.open-meteo.com:
// marine-2-spots = J-Bay + Pipeline in one request, marine-1-spot = Mundaka.
const AT = Date.parse('2026-10-09T08:30:00Z'); // J-Bay 10:30 SAST, Honolulu 22:30 on the 8th

const jbay = { slug: 'jeffreys-bay', lat: -34.0308, lon: 24.9338 };
const pipe = { slug: 'pipeline', lat: 21.665, lon: -158.0539 };

describe('marineUrl', () => {
	test('one request for many points, comma separated, timezone auto', () => {
		const u = new URL(marineUrl([jbay, pipe]));
		expect(u.origin + u.pathname).toBe('https://marine-api.open-meteo.com/v1/marine');
		expect(u.searchParams.get('latitude')).toBe('-34.0308,21.6650');
		expect(u.searchParams.get('longitude')).toBe('24.9338,-158.0539');
		expect(u.searchParams.get('timezone')).toBe('auto');
		expect(u.searchParams.get('hourly')!.split(',')).toContain('swell_wave_direction');
	});
});

describe('parseMarine', () => {
	test('array response: one series per point, in order, local dates', () => {
		const s = parseMarine(two);
		expect(s).toHaveLength(2);
		expect(s[0].timezone).toBe('Africa/Johannesburg');
		expect(s[0].utcOffset).toBe(7200);
		expect(s[0].date).toBe('2026-10-09');
		expect(s[1].date).toBe('2026-10-08');
		expect(s[0].time).toHaveLength(24);
	});
	test('single-point response is a bare object', () => {
		const s = parseMarine(one);
		expect(s).toHaveLength(1);
		expect(s[0].timezone).toBe('Europe/Madrid');
	});
	test('missing values become null, not NaN', () => {
		const s = parseMarine({ ...one, hourly: { time: ['2026-10-09T00:00'], swell_wave_height: [null] } });
		expect(s[0].hourly.swell_wave_height[0]).toBeNull();
		expect(s[0].hourly.wave_period[0]).toBeNull();
	});
	test('rejects a response without hourly data', () => {
		expect(() => parseMarine({ error: true, reason: 'bad' })).toThrow();
	});
});

describe('pickHour', () => {
	test('current local hour at each point', () => {
		const [j, p] = parseMarine(two);
		expect(pickHour(j, AT)).toEqual({ Hs: 1.44, Tp: 9.65, dirDeg: 204, at: '2026-10-09T10:00', partition: 'swell' });
		expect(pickHour(p, AT)).toEqual({ Hs: 1.48, Tp: 9.7, dirDeg: 326, at: '2026-10-08T22:00', partition: 'swell' });
	});
	test('a day that does not cover now gives null', () => {
		const [, p] = parseMarine(two);
		expect(pickHour(p, Date.parse('2026-10-09T12:00:00Z'))).toBeNull();
	});
	test('falls back to total sea when the swell partition is missing', () => {
		const s = parseMarine(one)[0];
		s.hourly.swell_wave_height = s.hourly.swell_wave_height.map(() => null);
		const t = pickHour(s, AT)!;
		expect(t.partition).toBe('sea');
		expect(t.Hs).toBe(s.hourly.wave_height[10]!);
	});
});

describe('todayForAll', () => {
	test('batches uncached spots into one request and caches the day', async () => {
		const urls: string[] = [];
		_setTransport(async (u: string) => {
			urls.push(u);
			return new Response(JSON.stringify(two));
		}, () => AT);
		const [a, b] = await todayForAll([jbay, pipe]);
		expect(urls).toHaveLength(1);
		expect(a?.Hs).toBe(1.44);
		expect(b?.dirDeg).toBe(326);
		// cached: no second request
		expect((await todayFor(jbay))?.Tp).toBe(9.65);
		expect(urls).toHaveLength(1);
	});
	test('concurrent callers share one request', async () => {
		let n = 0;
		_setTransport(async () => {
			n++;
			await new Promise((r) => setTimeout(r, 5));
			return new Response(JSON.stringify(one));
		}, () => AT);
		const m = { slug: 'mundaka', lat: 43.4073, lon: -2.6963 };
		const [x, y] = await Promise.all([todayFor(m), todayFor(m)]);
		expect(n).toBe(1);
		expect(x).toEqual(y);
		expect(x?.Hs).toBe(1.5);
	});
	test('a failed request gives null, not a throw', async () => {
		_setTransport(async () => new Response('nope', { status: 503 }), () => AT);
		expect(await todayFor(jbay)).toBeNull();
	});
});

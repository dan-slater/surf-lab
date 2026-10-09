/**
 * Capture each catalogue spot's coastline from OpenFreeMap vector tiles into
 * src/lib/spots/coasts/<slug>.json, using the app's own tile reader
 * (src/lib/spots/tiles.ts) through the dev server's /map page. Also checks the
 * catalogue: distance from each spot's lat/lon to the coast, and the open-sea
 * bearing against its swell window.
 *
 *   bun scripts/fetch-coasts.ts [base=http://127.0.0.1:5182] [slug ...]
 *
 * Keep it occasional: OpenFreeMap is free; do not bulk-download tiles.
 */
import { writeFileSync } from 'node:fs';
import { launch, warmGpu } from './browser';
import { spots } from '../src/lib/spots/spots';
import { CoastIndex } from '../src/lib/sim/bathy';
import { openSea } from '../src/lib/spots/frame';

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://127.0.0.1:5182';
const only = process.argv.slice(2).filter((a) => !a.startsWith('http'));
const ZOOM = 13;
const RADIUS = 3500;
const todo = spots.filter((s) => s.coastSource !== 'jbay' && (!only.length || only.includes(s.slug)));

const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1600, height: 1200 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await warmGpu(page, base);
await page.goto(`${base}/map`);
await page.waitForFunction(() => (window as any).__surflab?.map()?.loaded(), null, { timeout: 60000 });

for (const s of todo) {
	// zoom 13 and 3.5 km: the catalogue domain is 6.4 km along shore, so it needs more coast
	// than a map click's 2 km (zoom 14 detail, but OpenFreeMap fragments it at tile seams)
	const radius = RADIUS, zoom = ZOOM;
	let c = null;
	const thin = (x: any) => !x || x.polylines.reduce((a: number, p: unknown[]) => a + p.length, 0) < 20;
	// a read before every tile has landed comes back thin (2-vertex stubs): retry with longer waits
	for (let attempt = 0; attempt < 4 && thin(c); attempt++) {
		await page.evaluate(([lon, lat, z]) => (window as any).__surflab.map().jumpTo({ center: [lon, lat], zoom: z }), [s.lon, s.lat, zoom]);
		await page.waitForFunction(() => (window as any).__surflab.map().areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
		await page.waitForTimeout(800 * (attempt + 1));
		c = await page.evaluate(([lon, lat, r]) => (window as any).__surflab.coastAt(lon, lat, r), [s.lon, s.lat, radius]);
	}
	if (!c) {
		console.log(`${s.slug.padEnd(16)} NO OCEAN COAST within ${radius} m`);
		continue;
	}
	const idx = new CoastIndex(c.polylines, 'left');
	const d = idx.nearest(0, 0).s;
	const open = openSea(c.polylines, 'left');
	const n = c.polylines.reduce((a: number, p: unknown[]) => a + p.length, 0);
	const file = {
		slug: s.slug,
		lat: s.lat,
		lon: s.lon,
		zoom,
		radiusMeters: radius,
		fetched: new Date().toISOString().slice(0, 10),
		source: c.source,
		oceanSide: 'left',
		polylines: c.polylines
	};
	writeFileSync(`src/lib/spots/coasts/${s.slug}.json`, JSON.stringify(file));
	console.log(
		`${s.slug.padEnd(16)} r ${radius} m, ${c.polylines.length} lines, ${n} vertices, flipped ${c.flipped}, unchecked ${c.unchecked}; ` +
			`point is ${Math.abs(d).toFixed(0)} m ${d > 0 ? 'offshore' : 'inland'}; open sea toward ${open.bearingDeg.toFixed(0)} deg; window ${s.swellWindow.fromDeg}-${s.swellWindow.toDeg}`
	);
}
await b.close();

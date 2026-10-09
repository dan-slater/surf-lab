/**
 * Prove "click a coast, get a sim" headless: open /map, move the camera near
 * a coast, click the coast with the real mouse, wait for the sim, report the
 * domain and save a composited screenshot.
 *
 *   bun scripts/map-click.ts [base=http://127.0.0.1:5182] [lon,lat=31.0424,-29.8587] [out.png]
 *
 * Needs the dev server (the page exposes window.__surflab in dev only).
 */
import { launch, warmGpu } from './browser';
import { compositeShot } from './app-shot';

const base = process.argv[2] ?? 'http://127.0.0.1:5182';
const [lon, lat] = (process.argv[3] ?? '31.0424,-29.8587').split(',').map(Number);
const out = process.argv[4] ?? `${process.env.HOME}/orch-scratch/app-shots/map-click.png`;

const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1440, height: 900 });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(`[console.${m.type()}]`, m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await warmGpu(page, base);
await page.goto(`${base}/map`);
await page.waitForFunction(() => (window as any).__surflab?.map()?.loaded(), null, { timeout: 60000 });
console.log('map loaded');
// zoom 9 near the coast so a click lands within a pixel or two (~270 m) of it
await page.evaluate(([lon, lat]) => (window as any).__surflab.map().jumpTo({ center: [lon + 0.08, lat], zoom: 9 }), [lon, lat]);
await page.waitForTimeout(2500);
const p = await page.evaluate(([lon, lat]) => (window as any).__surflab.map().project([lon, lat]), [lon, lat]);
console.log(`clicking ${lon},${lat} at pixel ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
const t0 = Date.now();
await page.mouse.click(p.x, p.y);
await page.waitForFunction(() => { const s = (window as any).__surflab.state(); return !s.busy && (s.scene || s.message); }, null, { timeout: 90000 });
const st = await page.evaluate(() => (window as any).__surflab.state());
console.log(`after ${((Date.now() - t0) / 1000).toFixed(1)} s:`, JSON.stringify(st));
await page.waitForTimeout(Number(process.env.WAIT ?? 20000));
console.log((await page.evaluate(() => document.querySelector('.bar')?.textContent ?? '')).replace(/\s+/g, ' '));
await compositeShot(page, out);
console.log(`wrote ${out}`);
if (process.env.COVER === '1') {
	// "Cover this spot", then a reload: the clicked coast must come back from localStorage
	await page.getByRole('button', { name: 'Cover this spot' }).click();
	await page.waitForURL(`${base}/`);
	await page.waitForTimeout(12000);
	await page.reload();
	await page.waitForTimeout(15000);
	await page.keyboard.press('Space');
	await page.waitForTimeout(600);
	console.log('cover after reload:', (await page.locator('select').first().inputValue()), (await page.locator('.dial').innerText()).replace(/\s+/g, ' ').slice(0, 160));
	await compositeShot(page, out.replace(/\.png$/, '-cover.png'));
}
await b.close();

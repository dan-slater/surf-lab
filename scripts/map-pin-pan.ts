/**
 * Headless check of the map's other paths: click the J-Bay pin on the globe,
 * read the panel, press "Simulate here", then drag the map and confirm the sim
 * re-centres (a new domain key). Saves two composited screenshots.
 *
 *   bun scripts/map-pin-pan.ts [base=http://127.0.0.1:5182]
 */
import { launch, warmGpu } from './browser';
import { compositeShot } from './app-shot';

const base = process.argv[2] ?? 'http://127.0.0.1:5182';
const dir = `${process.env.HOME}/orch-scratch/app-shots`;
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1440, height: 900 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await warmGpu(page, base);
await page.goto(`${base}/map`);
await page.waitForFunction(() => (window as any).__surflab?.map()?.loaded(), null, { timeout: 60000 });
await page.evaluate(() => (window as any).__surflab.map().jumpTo({ center: [25, -30], zoom: 3 }));
await page.waitForTimeout(1500);
const pin = page.getByRole('button', { name: 'Jeffreys Bay' }).first();
await pin.click();
await page.waitForTimeout(2500);
console.log('panel:', (await page.locator('.mk-panel').first().innerText()).replace(/\s+/g, ' ').slice(0, 300));
await page.getByRole('button', { name: 'Simulate here' }).click();
await page.waitForFunction(() => { const s = (window as any).__surflab.state(); return !s.busy && (s.scene || s.message); }, null, { timeout: 90000 });
const s1 = await page.evaluate(() => (window as any).__surflab.state());
console.log('simulate:', JSON.stringify(s1.scene?.key), s1.message);
await page.waitForTimeout(25000);
await compositeShot(page, `${dir}/map-jbay.png`);
// drag the map ~350 px (about 3 km at zoom 14) to the left
await page.mouse.move(900, 450);
await page.mouse.down();
await page.mouse.move(700, 450, { steps: 10 });
await page.mouse.move(550, 450, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(1500);
await page.waitForFunction(() => { const s = (window as any).__surflab.state(); return !s.busy; }, null, { timeout: 90000 });
const s2 = await page.evaluate(() => (window as any).__surflab.state());
console.log('after pan:', JSON.stringify(s2.scene?.key), s2.message, s1.scene?.key !== s2.scene?.key ? 'RE-CENTRED' : 'same domain');
await page.waitForTimeout(8000);
await compositeShot(page, `${dir}/map-pan.png`);
await b.close();

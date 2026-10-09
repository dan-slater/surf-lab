/**
 * Capture the first canvas on a page as PNG (headless Chrome does not
 * composite WebGPU canvases into page screenshots, so read the canvas itself).
 *   bun scripts/shot.ts <url> <out.png> [waitMs]
 */
import { writeFileSync } from 'node:fs';
import { launch, warmGpu } from './browser';

const [url, out, wait] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 5000)];
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1600, height: 760 });
page.on('console', (m) => m.type() !== 'debug' && console.log(`[console.${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await warmGpu(page, url);
await page.goto(url);
await page.waitForTimeout(wait);
console.log((await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
const data = await page.evaluate(() => document.querySelector('canvas')?.toDataURL('image/png') ?? '');
writeFileSync(out, Buffer.from(data.split(',')[1] ?? '', 'base64'));
console.log(`wrote ${out}`);
await b.close();

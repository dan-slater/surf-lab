/**
 * Screenshot every instrument on /book/instruments into docs/img/instruments/,
 * plus a few book pages (contents, a chapter on desktop with the bench
 * swapped mid-scroll, the same chapter on a phone). Reports console errors.
 *
 *   bun scripts/shoot-instruments.ts [baseUrl]     (default http://127.0.0.1:5183)
 *
 * Uses the sim line's scripts/browser.ts (headless Chrome with WebGPU).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, warmGpu } from './browser';

const base = process.argv[2] ?? 'http://127.0.0.1:5183';
const out = 'docs/img/instruments';
mkdirSync(out, { recursive: true });
mkdirSync('docs/img/book', { recursive: true });

const b = await launch();
const page = await b.contexts()[0].newPage();
const problems: string[] = [];
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

await page.setViewportSize({ width: 1100, height: 900 });
await warmGpu(page, base);
await page.goto(`${base}/book/instruments`);
const ids = await page.$$eval('[data-instrument]', (els) => els.map((e) => (e as HTMLElement).dataset.instrument!));
for (const id of ids) {
	const sel = `[data-instrument="${id}"]`;
	await page.locator(sel).scrollIntoViewIfNeeded();
	await page.waitForTimeout(id === 'sim' ? 6000 : 1500);
	const fig = page.locator(`${sel} figure`);
	if (id === 'sim') {
		// headless Chrome does not composite WebGPU canvases into screenshots: show the
		// canvas read back as an <img> in its place for the shot, and keep the raw frame too
		const data = await page
			.$eval(`${sel} canvas`, (c) => {
				const cv = c as HTMLCanvasElement;
				const url = cv.toDataURL('image/png');
				const img = document.createElement('img');
				img.src = url;
				img.className = cv.className;
				img.style.cssText = 'display:block;width:100%;height:auto;border-radius:4px';
				img.dataset.shot = '1';
				cv.style.display = 'none';
				cv.after(img);
				return url;
			})
			.catch(() => '');
		if (data) writeFileSync(`${out}/sim-canvas.png`, Buffer.from(data.split(',')[1] ?? '', 'base64'));
		await page.waitForTimeout(200);
		await fig.screenshot({ path: `${out}/${id}.png` });
		await page.$eval(`${sel} canvas`, (c) => {
			(c as HTMLCanvasElement).style.display = '';
			document.querySelector('img[data-shot]')?.remove();
		});
	} else {
		await fig.screenshot({ path: `${out}/${id}.png` });
	}
	const readout = (await page.locator(`${sel} .readout`).innerText().catch(() => '')).replace(/\s+/g, ' ');
	console.log(`${id.padEnd(11)} ${readout.slice(0, 150)}`);
}

// pages
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}/book`);
await page.screenshot({ path: `docs/img/book/contents.png` });
await page.goto(`${base}/book/breaking`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `docs/img/book/breaking-top.png` });
const benchAt = async () => (await page.locator('.bench .instrument .title').first().innerText().catch(() => '')).trim();
const seen: string[] = [await benchAt()];
for (const h of await page.$$('section.sec > h2')) {
	await h.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
	await page.waitForTimeout(900);
	seen.push(await benchAt());
}
console.log('bench while scrolling /book/breaking:', seen.join(' | '));
await page.screenshot({ path: `docs/img/book/breaking-scrolled.png` });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/book/riding`);
await page.locator('section.sec').nth(1).locator('.inline').scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
await page.screenshot({ path: `docs/img/book/riding-phone.png` });

console.log(problems.length ? `console problems:\n${problems.join('\n')}` : 'no console errors');
await b.close();

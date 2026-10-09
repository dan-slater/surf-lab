/**
 * Screenshot an app page with its WebGPU canvases composited in. Headless
 * Chrome leaves WebGPU canvases out of page screenshots, so each non-MapLibre
 * canvas is swapped for an <img> of its own pixels just before the shot.
 *
 *   bun scripts/app-shot.ts <url> <out.png> [waitMs=6000] [WxH=1440x900] [--key]
 *
 * --key presses a key first (reveals the dial on the cover).
 * Only ever point it at the local dev server.
 */
import { launch, warmGpu } from './browser';
import type { Page } from 'playwright-core';

export async function compositeShot(page: Page, out: string) {
	await page.evaluate(() => {
		for (const c of Array.from(document.querySelectorAll('canvas'))) {
			if (c.classList.contains('maplibregl-canvas')) continue;
			let url = '';
			try {
				url = c.toDataURL('image/png');
			} catch {
				continue;
			}
			const img = document.createElement('img');
			img.src = url;
			const r = c.getBoundingClientRect();
			Object.assign(img.style, {
				position: 'fixed',
				left: `${r.left}px`,
				top: `${r.top}px`,
				width: `${r.width}px`,
				height: `${r.height}px`,
				pointerEvents: 'none',
				zIndex: getComputedStyle(c).zIndex === 'auto' ? '0' : getComputedStyle(c).zIndex
			});
			c.after(img);
			c.style.visibility = 'hidden';
		}
	});
	await page.waitForTimeout(150);
	await page.screenshot({ path: out });
}

if (import.meta.main) {
	const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
	const [url, out] = args;
	const wait = Number(args[2] ?? 6000);
	const [w, h] = (args[3] ?? '1440x900').split('x').map(Number);
	const b = await launch();
	const page = await b.contexts()[0].newPage();
	await page.setViewportSize({ width: w, height: h });
	page.on('console', (m) => m.type() !== 'debug' && console.log(`[console.${m.type()}]`, m.text()));
	page.on('pageerror', (e) => console.log('[pageerror]', e.message));
	page.on('response', (r) => r.status() >= 400 && console.log('[http]', r.status(), r.url()));
	await warmGpu(page, url);
	await page.goto(url);
	await page.waitForTimeout(wait);
	if (process.argv.includes('--key')) {
		await page.keyboard.press('Space');
		await page.waitForTimeout(500);
	}
	console.log((await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400));
	await compositeShot(page, out);
	console.log(`wrote ${out}`);
	await b.close();
}

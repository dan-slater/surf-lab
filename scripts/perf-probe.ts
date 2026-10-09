// Sample window.__perf on a page: fps, steps per frame, GPU ms per step and per render, budget level.
import { launch, warmGpu } from './browser';
const url = process.argv[2];
const secs = Number(process.argv[3] ?? 8);
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) });
await warmGpu(page, url);
await page.goto(url);
await page.waitForTimeout(2500);
const rows: any[] = [];
for (let i = 0; i < secs * 2; i++) {
	rows.push(await page.evaluate(() => (window as any).__perf));
	await page.waitForTimeout(500);
}
const avg = (k: string) => rows.reduce((a, r) => a + (r?.[k] ?? 0), 0) / rows.length;
const levels = [...new Set(rows.map((r) => r?.level))];
console.log(`${process.env.W ?? 1440}x${process.env.H ?? 860}: fps ${avg('fps').toFixed(1)}, steps/frame ${avg('steps').toFixed(2)}, ${avg('msPerStep').toFixed(3)} ms/step, ${avg('msOther').toFixed(2)} ms render+tracker, levels ${levels.join(' -> ')}`);
await b.close();

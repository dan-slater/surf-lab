// Sample window.__surfers on /sim/cover: state counts, rides and wipeouts over time.
import { launch, warmGpu } from './browser';
const url = process.argv[2] ?? 'http://127.0.0.1:5181/sim/cover?warm=400';
const secs = Number(process.argv[3] ?? 30);
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1440, height: 860 });
await warmGpu(page, url);
await page.goto(url);
await page.waitForTimeout(2000);
const states: Record<string, number> = {};
let last: { rides: number; wipeouts: number }[] = [];
for (let i = 0; i < secs * 2; i++) {
	last = (await page.evaluate(() => (window as any).__surfers)) as any[];
	for (const s of last as any[]) states[s.state] = (states[s.state] ?? 0) + 1;
	await page.waitForTimeout(500);
}
const tot = Object.values(states).reduce((a, b) => a + b, 0);
console.log('state share', Object.fromEntries(Object.entries(states).map(([k, v]) => [k, +(v / tot).toFixed(2)])));
console.log('rides', last.reduce((a, s) => a + s.rides, 0), 'wipeouts', last.reduce((a, s) => a + s.wipeouts, 0), `in ${secs} s real`);
const log = (await page.evaluate(() => (window as any).__rides)) as { seconds: number; meters: number; end: string }[];
const ends: Record<string, number> = {};
for (const r of log) ends[r.end] = (ends[r.end] ?? 0) + 1;
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(1) : '-');
console.log(`completed rides ${log.length}: median ${med(log.map((r) => r.seconds))} model s, ${med(log.map((r) => r.meters))} m; ends`, ends);
console.log(await page.evaluate(() => document.querySelector('p')?.textContent));
await b.close();

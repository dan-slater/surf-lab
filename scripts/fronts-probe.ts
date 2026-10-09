// Sample window.__fronts on /sim/cover for a while and summarise.
import { launch, warmGpu } from './browser';
const url = process.argv[2] ?? 'http://127.0.0.1:5181/sim/cover?warm=400&fronts=1';
const secs = Number(process.argv[3] ?? 10);
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: 1440, height: 860 });
await warmGpu(page, url);
await page.goto(url);
await page.waitForTimeout(3000);
const seen: Record<string, number[]> = {};
let peelSamples = 0, samples = 0;
const speeds: number[] = [], vps: number[] = [], ages: number[] = [];
for (let i = 0; i < secs * 4; i++) {
	const s = (await page.evaluate(() => (window as any).__fronts)) as { t: number; fronts: any[] };
	samples++;
	for (const f of s.fronts) {
		if (!f.peeling) continue;
		peelSamples++;
		speeds.push(f.speed); vps.push(f.vp); ages.push(f.age);
		(seen[f.id] ??= []).push(s.t);
	}
	await page.waitForTimeout(250);
}
const q = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))].toFixed(1) : '-';
console.log(`samples ${samples}, peeling front-samples ${peelSamples}, distinct peeling fronts ${Object.keys(seen).length}`);
console.log(`speed m/s p10/p50/p90 ${q(speeds, .1)}/${q(speeds, .5)}/${q(speeds, .9)}; Vp ${q(vps, .1)}/${q(vps, .5)}/${q(vps, .9)}; age ${q(ages, .5)}/${q(ages, .9)} s`);
await b.close();

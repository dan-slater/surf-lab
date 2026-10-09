// GPU throughput on /sim/cover?bench=1: ms per solver step and per rendered frame.
import { launch, warmGpu } from './browser';
const url = process.argv[2] ?? 'http://127.0.0.1:5181/sim/cover?bench=1&warm=200';
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) });
await warmGpu(page, url);
await page.goto(url);
await page.waitForFunction(() => (window as any).__bench, null, { timeout: 120000 });
const r = (await page.evaluate(() => (window as any).__bench)) as any;
console.log(`${url.replace(/.*\?/, '')} ${process.env.W ?? 1440}x${process.env.H ?? 860}: ${r.cells} cells, ${r.stepMs.toFixed(3)} ms/step; ${(r.px / 1e6).toFixed(2)} Mpx canvas, ${r.frameMs.toFixed(3)} ms/frame (render + tracker)`);
await b.close();

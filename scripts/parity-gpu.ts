/**
 * Run the J-Bay parity harness (/sim/parity) on the local GPU and save the
 * statistics. Needs the dev server on 127.0.0.1:5181.
 *   bun scripts/parity-gpu.ts [spinup=480] [record=120] [out=parity-out/gpu.json] [query]
 */
import { writeFileSync } from 'node:fs';
import { launch, warmGpu } from './browser';

const spinup = Number(process.argv[2] ?? 480);
const record = Number(process.argv[3] ?? 120);
const out = process.argv[4] ?? 'parity-out/gpu.json';
const extra = process.argv[5] ? `&${process.argv[5]}` : '';
const url = `http://127.0.0.1:5181/sim/parity?spinup=${spinup}&record=${record}${extra}`;
const b = await launch();
const page = await b.contexts()[0].newPage();
page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()));
await warmGpu(page, url);
await page.goto(url);
await page.waitForFunction(() => (window as unknown as { __parity?: unknown }).__parity, null, { timeout: 600000, polling: 500 });
const r = (await page.evaluate(() => (window as unknown as { __parity: unknown }).__parity)) as Record<string, unknown>;
console.log(await page.evaluate(() => document.querySelector('pre')?.textContent));
writeFileSync(out, JSON.stringify({ engine: 'gpu', ...r }));
console.log(`wrote ${out}`);
await b.close();

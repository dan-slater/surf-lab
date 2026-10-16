// Load timeline probe: nav timing, long tasks, slowest resources, "Shaping the seabed" marks.
//   bun scripts/load-probe.mjs <url> [waitMs=25000]   (system Chrome on the Mac; headless shows WebGPU, not MapLibre)
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'https://surf.danielslater.dev/';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const t0 = Date.now();
const log = [];
page.on('console', (m) => log.push(`${Date.now() - t0}ms console.${m.type()}: ${m.text().slice(0, 160)}`));
page.on('pageerror', (e) => log.push(`${Date.now() - t0}ms pageerror: ${e.message.slice(0, 160)}`));
await page.addInitScript(() => {
  window.__lt = []; window.__marks = {};
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  const mo = new MutationObserver(() => {
    const t = document.body?.innerText ?? '';
    const now = Math.round(performance.now());
    if (t.includes('Shaping the seabed') && !window.__marks.seabedShown) window.__marks.seabedShown = now;
    if (window.__marks.seabedShown && !t.includes('Shaping the seabed') && !window.__marks.seabedGone) window.__marks.seabedGone = now;
    if (t.includes('WebGPU') && !window.__marks.gpuMsg) window.__marks.gpuMsg = now;
  });
  addEventListener('DOMContentLoaded', () => mo.observe(document.body, { subtree: true, childList: true, characterData: true }));
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(process.argv[3] ?? 25000));
const r = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource').map((e) => ({ n: e.name.replace(location.origin, ''), t: Math.round(e.startTime), d: Math.round(e.duration), kb: Math.round(e.transferSize / 1024) }));
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
  const lcp = performance.getEntriesByType('largest-contentful-paint').pop();
  return { gpu: !!navigator.gpu, ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), paint, marks: window.__marks, longtasks: window.__lt, res };
});
console.log(JSON.stringify({ ...r, res: undefined }, null, 0));
console.log('resources (start ms, duration ms, KB):');
r.res.sort((a, b) => b.d - a.d).slice(0, 14).forEach((x) => console.log(`  ${String(x.t).padStart(6)} ${String(x.d).padStart(6)} ${String(x.kb).padStart(5)}KB ${x.n.slice(0, 110)}`));
console.log('total KB', r.res.reduce((a, x) => a + x.kb, 0), 'requests', r.res.length);
log.slice(0, 12).forEach((l) => console.log(l));
await b.close();

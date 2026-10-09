/**
 * Headless Chromium with WebGPU on the local GPU (Vulkan), for screenshots and
 * the parity harness. Chrome is spawned directly (new headless mode) and
 * attached over CDP; Playwright's own launcher did not expose the GPU adapter.
 * Only ever point it at the local dev server.
 *
 * CHROMIUM overrides the executable (default: newest Playwright Chromium under
 * ~/.cache/ms-playwright). SWIFTSHADER=1 uses the CPU WebGPU adapter instead.
 */
import { chromium, type Browser } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

export function chromiumPath(): string {
	if (process.env.CHROMIUM) return process.env.CHROMIUM;
	const root = `${homedir()}/.cache/ms-playwright`;
	const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort();
	if (!dirs.length) throw new Error('no Playwright Chromium; run: bunx playwright install chromium');
	return `${root}/${dirs[dirs.length - 1]}/chrome-linux64/chrome`;
}

const GPU_FLAGS = [
	'--enable-unsafe-webgpu',
	'--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan',
	'--use-angle=vulkan',
	'--use-vulkan=native',
	'--disable-vulkan-surface',
	'--ignore-gpu-blocklist'
];
const SWIFTSHADER_FLAGS = ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];

export async function launch(): Promise<Browser & { kill(): void }> {
	const flags = process.env.SWIFTSHADER === '1' ? SWIFTSHADER_FLAGS : GPU_FLAGS;
	const profile = mkdtempSync(`${tmpdir()}/surflab-chrome-`);
	const proc = spawn(
		chromiumPath(),
		['--headless=new', '--no-sandbox', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...flags, 'about:blank'],
		{ stdio: ['ignore', 'ignore', 'pipe'] }
	);
	const ws = await new Promise<string>((resolve, reject) => {
		let buf = '';
		const timer = setTimeout(() => reject(new Error(`Chrome did not start:\n${buf}`)), 15000);
		proc.stderr!.on('data', (d: Buffer) => {
			buf += d.toString();
			const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
			if (m) {
				clearTimeout(timer);
				resolve(m[1]);
			}
		});
		proc.on('exit', (c) => reject(new Error(`Chrome exited (${c}):\n${buf}`)));
	});
	const browser = await chromium.connectOverCDP(ws);
	const kill = () => proc.kill('SIGKILL');
	const close = browser.close.bind(browser);
	browser.close = async () => {
		await close().catch(() => {});
		kill();
	};
	return Object.assign(browser, { kill });
}

/** Wake the GPU process: the first requestAdapter in a fresh headless Chrome returns null. */
export async function warmGpu(page: import('playwright-core').Page, url: string) {
	await page.goto(new URL('/', url).href);
	await page.evaluate(async () => {
		for (let i = 0; i < 10; i++) {
			if (await navigator.gpu?.requestAdapter()) return;
			await new Promise((r) => setTimeout(r, 300));
		}
	});
}

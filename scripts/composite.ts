// Capture every canvas on a page (WebGPU and 2d layers), composited, as PNG or JPEG:
//   bun scripts/composite.ts <url> <out.png|out.jpg> [waitMs]   (W, H env for the viewport)
import { writeFileSync } from 'node:fs';
import { launch, warmGpu } from './browser';
const [url, out, wait] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 4000)];
const b = await launch();
const page = await b.contexts()[0].newPage();
await page.setViewportSize({ width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) });
page.on('console', (m) => m.type() === 'error' && console.log('[console.error]', m.text()));
await warmGpu(page, url);
await page.goto(url);
await page.waitForTimeout(wait);
const data = await page.evaluate(async (jpeg) => {
	const cs = [...document.querySelectorAll('canvas')] as HTMLCanvasElement[];
	const c = document.createElement('canvas');
	c.width = cs[0].width; c.height = cs[0].height;
	const x = c.getContext('2d')!;
	for (const k of cs) {
		// WebGPU canvases lose their image once presented; toDataURL still has it
		const img = new Image();
		img.src = k.toDataURL();
		await img.decode();
		x.drawImage(img, 0, 0);
	}
	return c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9);
}, out.endsWith('.jpg'));
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log('wrote', out);
await b.close();

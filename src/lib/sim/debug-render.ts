/**
 * A plain painter for the solver fields: eta on a diverging colour map, foam
 * in white, land in brown. It draws the grid as a quad through a 2 x 3 affine
 * map from grid index space (ix, iy) to clip space, so it can sit in a map
 * overlay (see affineFromProjection) or fill a canvas (runCLayout).
 */
import debugWgsl from './debug.wgsl?raw';
import { cellCentre, type GridSpec } from './bathy';
import type { Solver } from './solver';

/** rows of the affine: clip = [a b c; d e f] * (ix, iy, 1) */
export type Affine = [number, number, number, number, number, number];

/** Run C's view: along-shore (iy) left to right, land (ix = 0) at the top. */
export function runCLayout(nx: number, ny: number): Affine {
	return [0, 2 / ny, -1 + 1 / ny, -2 / nx, 0, 1 - 1 / nx];
}

/**
 * Affine for a map overlay. `toPixel` maps ENU metres to canvas pixels (for
 * map-kit: enuFrame inverse, then project). The map is treated as locally
 * affine across the domain, which holds to well under a pixel for a few km.
 */
export function affineFromProjection(
	grid: GridSpec,
	toPixel: (x: number, y: number) => [number, number],
	width: number,
	height: number
): Affine {
	const clip = (ix: number, iy: number) => {
		const [px, py] = toPixel(...cellCentre(grid, ix, iy));
		return [(2 * px) / width - 1, 1 - (2 * py) / height];
	};
	const o = clip(0, 0);
	const u = clip(grid.nx - 1, 0);
	const v = clip(0, grid.ny - 1);
	const a = (u[0] - o[0]) / (grid.nx - 1), d = (u[1] - o[1]) / (grid.nx - 1);
	const b = (v[0] - o[0]) / (grid.ny - 1), e = (v[1] - o[1]) / (grid.ny - 1);
	return [a, b, o[0], d, e, o[1]];
}

export interface DebugRenderer {
	draw(): void;
	setAffine(m: Affine): void;
	dispose(): void;
}

export function createDebugRenderer(
	device: GPUDevice,
	canvas: HTMLCanvasElement | OffscreenCanvas,
	solver: Solver,
	opts: { affine?: Affine; etaScale?: number } = {}
): DebugRenderer {
	const { nx, ny } = solver.params;
	const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
	const format = navigator.gpu.getPreferredCanvasFormat();
	ctx.configure({ device, format, alphaMode: 'premultiplied' });
	const ubo = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const setAffine = (m: Affine) =>
		device.queue.writeBuffer(ubo, 0, new Float32Array([m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, nx, ny, opts.etaScale ?? 0.6, 0]));
	setAffine(opts.affine ?? runCLayout(nx, ny));
	const module = device.createShaderModule({ code: debugWgsl, label: 'debug.wgsl' });
	const pipe = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-strip' }
	});
	const bg = device.createBindGroup({
		layout: pipe.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: ubo } },
			{ binding: 1, resource: solver.fields.createView() },
			{ binding: 2, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }
		]
	});
	return {
		draw() {
			const enc = device.createCommandEncoder();
			const rp = enc.beginRenderPass({
				colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
			});
			rp.setPipeline(pipe);
			rp.setBindGroup(0, bg);
			rp.draw(4);
			rp.end();
			device.queue.submit([enc.finish()]);
		},
		setAffine,
		dispose() {
			ubo.destroy();
			ctx.unconfigure();
		}
	};
}

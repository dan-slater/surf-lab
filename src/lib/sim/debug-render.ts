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

/** The parts of map-kit's OverlayFrame this module uses (structural, no import). */
export interface OverlayLike {
	project(lon: number, lat: number): { x: number; y: number };
	/** canvas size in the same pixels `project` returns (CSS pixels for map-kit) */
	width: number;
	height: number;
}

/** The parts of map-kit's EnuFrame this module uses. */
export interface EnuLike {
	toLonLat(x: number, y: number): [number, number];
}

/**
 * Affine for a map-kit `<Overlay>`: grid -> ENU (GridSpec) -> lon/lat
 * (enuFrame.toLonLat) -> canvas pixels (frame.project) -> clip. Recompute it
 * in ondraw whenever the camera moves.
 */
export function affineFromOverlay(grid: GridSpec, enu: EnuLike, frame: OverlayLike): Affine {
	return affineFromProjection(
		grid,
		(x, y) => {
			const [lon, lat] = enu.toLonLat(x, y);
			const p = frame.project(lon, lat);
			return [p.x, p.y];
		},
		frame.width,
		frame.height
	);
}

/** Draw into a context someone else configured, such as map-kit's overlay (frame.gpu). */
export interface ExternalTarget {
	context: GPUCanvasContext;
	format: GPUTextureFormat;
}

export interface DebugRenderer {
	draw(): void;
	setAffine(m: Affine): void;
	dispose(): void;
}

/**
 * @param target a canvas (configured here, on the solver's device) or an
 *   already-configured context and its format (left as it is)
 */
export function createDebugRenderer(
	solver: Solver,
	target: HTMLCanvasElement | OffscreenCanvas | ExternalTarget,
	opts: { affine?: Affine; etaScale?: number } = {}
): DebugRenderer {
	const device = solver.device;
	const { nx, ny } = solver.params;
	const owned = !('context' in target);
	let ctx: GPUCanvasContext;
	let format: GPUTextureFormat;
	if ('context' in target) {
		ctx = target.context;
		format = target.format;
	} else {
		ctx = target.getContext('webgpu') as GPUCanvasContext;
		format = navigator.gpu.getPreferredCanvasFormat();
		ctx.configure({ device, format, alphaMode: 'premultiplied' });
	}
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
			if (owned) ctx.unconfigure();
		}
	};
}

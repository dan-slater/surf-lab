/**
 * The product renderer: the sea, foam and land in one WebGPU pass over the
 * solver's textures, drawn into a context the caller owns (a map-kit overlay's
 * or a page canvas's). See water.wgsl for the look and README.md for use.
 */
import waterWgsl from './water.wgsl?raw';
import type { Solver } from '../solver';
import type { Affine } from '../debug-render';
import { DEFAULT_THEME, packTheme, type Theme } from './theme';
import { thetaFromCompass } from '../swell';

export interface RenderLook {
	/** light direction as a compass bearing it shines FROM, in ENU (default: from the land side, see below) */
	lightFromDeg?: number;
	/** sun elevation (deg, default 35) */
	lightElevationDeg?: number;
	/** strength of face lighting and trough shadow (default 0.9) */
	lightStrength?: number;
	/** slope exaggeration for the lighting (default 7) */
	exaggeration?: number;
	/** crest line width (CSS px, default 1.3) */
	crestWidth?: number;
	/** foam iso-line width (CSS px, default 1.0) */
	foamWidth?: number;
	/** share of streak seeds drawn where foam is fresh, 0..1 (default 0.9) */
	streakDensity?: number;
	/** streak lattice spacing in cells; streaks are up to ~0.85 of it long (default 1.6) */
	streakLength?: number;
	/** foam ink opacity, 0..1 (default 0.9) */
	foamOpacity?: number;
}

export interface RendererOptions {
	context: GPUCanvasContext;
	format: GPUTextureFormat;
	theme?: Theme;
	/** grid -> clip transform; see viewAffine and affineFromOverlay */
	affine: Affine;
	/** device pixels per CSS pixel (map-kit: frame.pixelRatio) */
	pixelRatio?: number;
	/** grid rotation, to turn compass bearings into grid directions (default 0) */
	rotationDeg?: number;
	look?: RenderLook;
	/**
	 * Drawing over a map (map-kit's premultiplied overlay canvas): land is left
	 * transparent so the basemap shows, and the sea fades out past the grid edge.
	 * Default false: every pixel is opaque.
	 */
	overlay?: boolean;
}

export interface Renderer {
	/** draw the current solver state; `time` (s) animates the foam streaks */
	draw(time: number): void;
	setAffine(m: Affine, pixelRatio?: number): void;
	setTheme(t: Theme): void;
	setLook(l: RenderLook): void;
	/** Hs (m) the crest-line weighting is scaled to; follow setSwell */
	setHs(Hs: number): void;
	dispose(): void;
}

export function createRenderer(solver: Solver, o: RendererOptions): Renderer {
	const device = solver.device;
	const { nx, ny, dx } = solver.params;
	const view = new Float32Array(36);
	const viewBuf = device.createBuffer({ size: view.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const themeBuf = device.createBuffer({ size: 9 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	let affine = o.affine;
	let pixelRatio = o.pixelRatio ?? 1;
	let look: RenderLook = { ...o.look };
	let Hs = 2;
	const rot = o.rotationDeg ?? 0;

	function writeView(time: number) {
		// light: by default from the land side (-ix) and a little along shore,
		// so shoreward-facing wave faces are lit
		const from = look.lightFromDeg;
		let lx = -0.85, ly = 0.35;
		if (from !== undefined) {
			const th = thetaFromCompass(from, rot) + Math.PI; // direction the light comes from
			lx = Math.cos(th);
			ly = Math.sin(th);
		}
		const el = ((look.lightElevationDeg ?? 35) * Math.PI) / 180;
		const ln = Math.hypot(lx, ly);
		const sw = solver.swellDirection();
		view.set([affine[0], affine[1], affine[2], 0, affine[3], affine[4], affine[5], 0]);
		view.set([nx, ny, dx, pixelRatio], 8);
		view.set([(lx / ln) * Math.cos(el), (ly / ln) * Math.cos(el), Math.sin(el), look.lightStrength ?? 0.9], 12);
		view.set([time, Hs, look.exaggeration ?? 7, (look.crestWidth ?? 1.3) * pixelRatio], 16);
		view.set([(look.foamWidth ?? 1.0) * pixelRatio, look.streakDensity ?? 0.9, look.streakLength ?? 1.6, look.foamOpacity ?? 0.9], 20);
		view.set([sw[0], sw[1], o.overlay ? 1 : 0, 0], 24);
		// inverse affine: clip -> grid
		const [a, b, c, d, e, f] = affine;
		const det = a * e - b * d;
		view.set([e / det, -b / det, (b * f - c * e) / det, 0], 28);
		view.set([-d / det, a / det, (c * d - a * f) / det, 0], 32);
		device.queue.writeBuffer(viewBuf, 0, view);
	}
	const setTheme = (t: Theme) => device.queue.writeBuffer(themeBuf, 0, packTheme(t));
	setTheme(o.theme ?? DEFAULT_THEME);

	const module = device.createShaderModule({ code: waterWgsl, label: 'water.wgsl' });
	const pipe = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format: o.format }] },
		primitive: { topology: 'triangle-list' }
	});
	const bg = device.createBindGroup({
		layout: pipe.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: { buffer: viewBuf } },
			{ binding: 1, resource: { buffer: themeBuf } },
			{ binding: 2, resource: solver.fields.createView() },
			{ binding: 3, resource: solver.flow.createView() },
			{ binding: 4, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }
		]
	});

	return {
		draw(time: number) {
			writeView(time);
			const enc = device.createCommandEncoder();
			const rp = enc.beginRenderPass({
				colorAttachments: [{ view: o.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
			});
			rp.setPipeline(pipe);
			rp.setBindGroup(0, bg);
			rp.draw(3);
			rp.end();
			device.queue.submit([enc.finish()]);
		},
		setAffine(m: Affine, pr?: number) {
			affine = m;
			if (pr !== undefined) pixelRatio = pr;
		},
		setTheme,
		setLook(l: RenderLook) {
			look = { ...look, ...l };
		},
		setHs(h: number) {
			Hs = h;
		},
		dispose() {
			viewBuf.destroy();
			themeBuf.destroy();
		}
	};
}

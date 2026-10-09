/**
 * One running simulation: bathymetry from the scene, the solver, the product
 * renderer, the breaking-front tracker and the surfers. The solver does the
 * forcing schedule itself (spin-up from flat with `rampFrom`, sets and lulls
 * with `Swell.groupiness`), and `solver.budget` holds each frame to a GPU time.
 * SimView.svelte drives it.
 */
import { bathyFromPolyline, JBAY_RECIPE, type GridSpec } from '../sim/bathy';
import { wavemakerDepth } from '../sim/config';
import type { Affine, ExternalTarget } from '../sim/debug-render';
import { createRenderer, type Renderer } from '../sim/render/renderer';
import { createFrontTracker, type FrontTracker } from '../sim/render/fronts';
import { createSurfers, type SurferCrowd } from '../sim/render/surfers';
import { createSolver, type Solver, type SolverBudget } from '../sim/solver';
import { generatorDirection, type GeneratorDirection, type Swell } from '../sim/swell';
import type { SimScene } from '../spots/scene';
import type { SpotSwell } from '../spots/spots';

export interface EngineOptions {
	device: GPUDevice;
	/** a page canvas (configured here, opaque) or map-kit's overlay context (drawn over the basemap) */
	target: HTMLCanvasElement | ExternalTarget;
	scene: SimScene;
	/** deep-water swell (the store's numbers); turned into the wavemaker direction here */
	swell: SpotSwell;
	/** model seconds per real second (default 4) */
	speed?: number;
	/** real seconds for the swell to build from flat (default 20) */
	spinUpSeconds?: number;
	/** modulate the swell into sets and lulls (default true) */
	sets?: boolean;
	/** stick surfers at the scene's named sections (default 8; 0 = none) */
	surfers?: number;
	/** GPU milliseconds a frame may spend on the sim and its drawing (default 12) */
	budgetMs?: number;
}

export interface SimEngine {
	readonly solver: Solver;
	readonly grid: GridSpec;
	/** how the last deep-water direction mapped onto this coast */
	readonly generator: GeneratorDirection;
	/** the budget's verdict: 'full', slow motion, or asking for a coarser grid */
	readonly level: SolverBudget['level'];
	/** the crowd, when the scene has sections to form lineups at */
	readonly crowd: SurferCrowd | null;
	/** advance by real elapsed time and paint */
	tick(now: number): void;
	setSwell(swell: SpotSwell): void;
	setAffine(m: Affine, pixelRatio?: number): void;
	dispose(): void;
}

/** wavemaker band and sponges kept constant in metres across cell sizes */
const WAVEMAKER_M = 75;
const SPONGE_M = 150;
/** lull depth when sets are on; the sim line's cover runs 0.5 */
const GROUPINESS = 0.5;

export function createSimEngine(o: EngineOptions): SimEngine {
	const { scene, device } = o;
	const grid = scene.grid;
	const { depth } = bathyFromPolyline(scene.coast.polylines, grid, JBAY_RECIPE, scene.overrides, {
		oceanSide: scene.coast.oceanSide
	});
	const wmCells = WAVEMAKER_M / grid.dx;
	const d0 = wavemakerDepth(depth, grid.nx, grid.ny, wmCells);
	const speed = o.speed ?? 4;
	const useSets = o.sets ?? true;

	const mapDir = (s: SpotSwell) =>
		generatorDirection(s.dirDeg, grid, d0, { Tp: s.Tp, maxObliquityDeg: scene.maxObliquityDeg });
	let generator = mapDir(o.swell);
	const local = (s: SpotSwell): Swell => ({
		Hs: Math.max(0, s.Hs),
		Tp: s.Tp,
		dirDeg: generator.dirDeg,
		spread: 20,
		groupiness: useSets ? GROUPINESS : 0,
		groupWaves: 8
	});

	const solver = createSolver(device, {
		nx: grid.nx,
		ny: grid.ny,
		dx: grid.dx,
		depth,
		swell: local(o.swell),
		rotationDeg: grid.rotationDeg,
		wavemaker: { width: wmCells },
		sponge: { width: SPONGE_M / grid.dx }
	});
	solver.rampFrom(0, { seconds: o.spinUpSeconds ?? 20 });

	const external = !(o.target instanceof HTMLCanvasElement);
	let context: GPUCanvasContext;
	let format: GPUTextureFormat;
	if (external) {
		({ context, format } = o.target as ExternalTarget);
	} else {
		context = (o.target as HTMLCanvasElement).getContext('webgpu') as GPUCanvasContext;
		format = navigator.gpu.getPreferredCanvasFormat();
		context.configure({ device, format, alphaMode: 'opaque' });
	}
	const renderer: Renderer = createRenderer(solver, {
		context,
		format,
		affine: [1, 0, 0, 0, 1, 0],
		rotationDeg: grid.rotationDeg,
		overlay: external
	});
	renderer.setHs(o.swell.Hs);
	const tracker: FrontTracker = createFrontTracker(solver, grid);
	const zones = scene.sections
		.filter((s) => s.x !== undefined && s.y !== undefined)
		.map((s) => [s.x!, s.y!] as [number, number]);
	const count = o.surfers ?? 8;
	const crowd = zones.length && count > 0 ? createSurfers({ zones, depth, grid, count, seed: 7 }) : null;
	const budget = solver.budget(o.budgetMs ?? 12);

	let prev = -1;
	return {
		solver,
		grid,
		crowd,
		get generator() {
			return generator;
		},
		get level() {
			return budget.level;
		},
		tick(now: number) {
			const realDt = prev < 0 ? 0 : Math.min(now - prev, 100) / 1000;
			prev = now;
			const t0 = solver.time;
			budget.frame(realDt * speed, realDt, () => {
				renderer.draw(solver.time);
				tracker.update();
			});
			crowd?.update(solver.time - t0, realDt, tracker.fronts());
		},
		setSwell(s: SpotSwell) {
			generator = mapDir(s);
			solver.setSwell(local(s));
			renderer.setHs(s.Hs);
		},
		setAffine: (m: Affine, pr?: number) => renderer.setAffine(m, pr),
		dispose() {
			if (external) {
				// leave the shared overlay canvas empty rather than frozen on the last frame
				const enc = device.createCommandEncoder();
				enc.beginRenderPass({
					colorAttachments: [
						{ view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
					]
				}).end();
				device.queue.submit([enc.finish()]);
			} else {
				context.unconfigure();
			}
			tracker.dispose();
			renderer.dispose();
			solver.dispose();
		}
	};
}

/**
 * Affine that fills a W x H canvas with the grid (cover fit, centre crop).
 * Landscape: along shore left to right, land at the top, swell arriving from
 * the bottom. Portrait: land on the left, along shore bottom to top. Both are
 * rotations of the map view, never mirror images.
 */
export function fillAffine(grid: GridSpec, W: number, H: number): Affine {
	const { nx, ny } = grid;
	const cx = (nx - 1) / 2;
	const cy = (ny - 1) / 2;
	if (W >= H) {
		// a little extra zoom keeps the wavemaker band and the dry hinterland off screen
		const k = Math.max(W / ny, H / nx) * 1.08;
		return [0, (2 * k) / W, (-2 * k * cy) / W, (-2 * k) / H, 0, (2 * k * cx) / H];
	}
	const k = Math.max(W / nx, H / ny) * 1.08;
	return [(2 * k) / W, 0, (-2 * k * cx) / W, 0, (2 * k) / H, (-2 * k * cy) / H];
}

/** ENU metres -> fractional grid index */
export function enuToIndex(grid: GridSpec, x: number, y: number): [number, number] {
	const r = (grid.rotationDeg * Math.PI) / 180;
	const ux = x - grid.origin[0];
	const uy = y - grid.origin[1];
	return [(ux * Math.cos(r) + uy * Math.sin(r)) / grid.dx, (-ux * Math.sin(r) + uy * Math.cos(r)) / grid.dx];
}

/** ENU metres -> CSS pixels through an affine on a W x H canvas */
export function enuToPixel(grid: GridSpec, m: Affine, W: number, H: number, x: number, y: number): [number, number] {
	const [ix, iy] = enuToIndex(grid, x, y);
	const cx = m[0] * ix + m[1] * iy + m[2];
	const cy = m[3] * ix + m[4] * iy + m[5];
	return [((cx + 1) / 2) * W, ((1 - cy) / 2) * H];
}


/**
 * One running simulation: bathymetry from the scene, the solver, the debug
 * painter, and the forcing schedule (spin-up from flat, sets and lulls).
 * SimView.svelte drives it; the renderer behind `draw()` is the sim line's
 * debug painter until build step 4 replaces it.
 */
import { bathyFromPolyline, JBAY_RECIPE, type GridSpec } from '../sim/bathy';
import { wavemakerDepth } from '../sim/config';
import { createDebugRenderer, type Affine, type DebugRenderer, type ExternalTarget } from '../sim/debug-render';
import { createSolver, type Solver } from '../sim/solver';
import { generatorDirection, type GeneratorDirection } from '../sim/swell';
import type { SimScene } from '../spots/scene';
import type { SpotSwell } from '../spots/spots';

export interface EngineOptions {
	device: GPUDevice;
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
}

export interface SimEngine {
	readonly solver: Solver;
	readonly grid: GridSpec;
	/** how the last deep-water direction mapped onto this coast */
	readonly generator: GeneratorDirection;
	/** 0..1 progress of the spin-up ramp */
	readonly spinUp: number;
	/** advance by real elapsed time and paint */
	tick(now: number): void;
	setSwell(swell: SpotSwell): void;
	setAffine(m: Affine): void;
	dispose(): void;
}

/** wavemaker band and sponges kept constant in metres across cell sizes */
const WAVEMAKER_M = 75;
const SPONGE_M = 150;

/**
 * Sets and lulls as a slow envelope on Hs: a set of N waves (8 to 12, drawn
 * afresh each cycle) followed by a lull of the same length. Range 0.45..1.
 *
 * STUB: the sim line is adding `setSwell({ groupiness })` and `rampFrom(0)` to
 * the solver; when they land, this schedule and the Hs scaling in `force()`
 * go and the solver does both.
 */
function setEnvelope(Tp: number) {
	let start = 0;
	let period = 2 * 10 * Tp;
	const draw = () => 2 * (8 + Math.floor(Math.random() * 5)) * Tp;
	return (t: number) => {
		while (t - start >= period) {
			start += period;
			period = draw();
		}
		const p = (t - start) / period;
		return 0.45 + 0.55 * Math.sin(Math.PI * p) ** 2;
	};
}

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function createSimEngine(o: EngineOptions): SimEngine {
	const { scene, device } = o;
	const grid = scene.grid;
	const { depth } = bathyFromPolyline(scene.coast.polylines, grid, JBAY_RECIPE, scene.overrides, {
		oceanSide: scene.coast.oceanSide
	});
	const wmCells = WAVEMAKER_M / grid.dx;
	const d0 = wavemakerDepth(depth, grid.nx, grid.ny, wmCells);
	const speed = o.speed ?? 4;
	const spinUpMs = (o.spinUpSeconds ?? 20) * 1000;
	const useSets = o.sets ?? true;

	let target = o.swell;
	let generator = generatorDirection(target.dirDeg, grid, d0, { Tp: target.Tp, maxObliquityDeg: scene.maxObliquityDeg });
	let envelope = setEnvelope(target.Tp);
	const local = (scale: number) => ({
		Hs: Math.max(0, target.Hs * scale),
		Tp: target.Tp,
		dirDeg: generator.dirDeg,
		spread: 20
	});

	const solver = createSolver(device, {
		nx: grid.nx,
		ny: grid.ny,
		dx: grid.dx,
		depth,
		swell: local(0),
		rotationDeg: grid.rotationDeg,
		wavemaker: { width: wmCells },
		sponge: { width: SPONGE_M / grid.dx }
	});
	const painter: DebugRenderer = createDebugRenderer(solver, o.target);
	const external = !(o.target instanceof HTMLCanvasElement);

	let t0 = -1;
	let prev = 0;
	let owed = 0;
	let lastForce = -Infinity;
	let ramp = 0;

	const force = () => {
		const env = useSets ? envelope(solver.time) : 1;
		solver.setSwell(local(ramp * env));
	};

	return {
		solver,
		grid,
		get generator() {
			return generator;
		},
		get spinUp() {
			return ramp;
		},
		tick(now: number) {
			if (t0 < 0) t0 = prev = now;
			owed += (Math.min(now - prev, 100) / 1000) * speed;
			prev = now;
			ramp = smoothstep((now - t0) / spinUpMs);
			// refresh the forcing a few times per model second, not every frame
			if (solver.time - lastForce > 0.5 || (ramp < 1 && now - t0 < spinUpMs + 200)) {
				force();
				lastForce = solver.time;
			}
			const n = Math.floor(owed / solver.params.dt);
			owed -= n * solver.params.dt;
			if (n > 0) solver.step(Math.min(n, 64));
			painter.draw();
		},
		setSwell(s: SpotSwell) {
			const tpChanged = s.Tp !== target.Tp;
			target = s;
			generator = generatorDirection(s.dirDeg, grid, d0, { Tp: s.Tp, maxObliquityDeg: scene.maxObliquityDeg });
			if (tpChanged) envelope = setEnvelope(s.Tp);
			force();
		},
		setAffine: painter.setAffine,
		dispose() {
			if (external) {
				// leave the shared overlay canvas empty rather than frozen on the last frame
				const t = o.target as ExternalTarget;
				const enc = device.createCommandEncoder();
				enc.beginRenderPass({
					colorAttachments: [
						{ view: t.context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }
					]
				}).end();
				device.queue.submit([enc.finish()]);
			}
			painter.dispose();
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


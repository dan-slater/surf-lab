/**
 * Solver options, Run C defaults, and the uniform layout shared by the WebGPU
 * solver (solver.ts) and its CPU twin (cpu.ts).
 */
import { G, swellComponents, type Swell, type WaveComponent } from './swell';

export interface SolverOptions {
	/** cells across shore; the wavemaker is on the ix = nx - 1 edge */
	nx: number;
	/** cells along shore; sponges on both ends */
	ny: number;
	/** cell size (m) */
	dx: number;
	/** still-water depth (m), > 0 wet, <= 0 land elevation; idx = ix * ny + iy */
	depth: Float32Array;
	swell: Swell;
	/** time step (s); default 0.12, Run C's value at dx = 12.5 m. See suggestDt */
	dt?: number;
	/** steps per step() call; default 3 */
	substeps?: number;
	/** Manning n; default 0.025 */
	manning?: number;
	/** grid rotation (deg, see FRAME.md) used to turn swell.dirDeg into a grid angle; default 0 */
	rotationDeg?: number;
	/** relaxation wavemaker band: width in cells (6) and edge strength per step (0.9) */
	wavemaker?: { width?: number; strength?: number };
	/** along-shore sponges: width in cells (12) and damping rate per step (0.06) */
	sponge?: { width?: number; rate?: number };
	/** breaking trigger and foam (Run C's loosened visual thresholds by default) */
	breaking?: {
		/** only break where depth < this (m), default 7 */
		maxDepth?: number;
		/** Froude number threshold, default 0.30 */
		froude?: number;
		/** surface slope threshold, default 0.10 */
		steepness?: number;
		/** crest elevation over depth threshold, default 0.22 */
		depthRatio?: number;
		/** foam e-folding time (s), default 6 */
		foamTau?: number;
	};
	/** slow set/lull envelope on the wavemaker: period (s) and depth 0..1; default off */
	envelope?: { period?: number; depth?: number };
	/** foam level counted as "covered" by the statistics pass; default 0.15 */
	foamThreshold?: number;
}

export interface Params {
	nx: number;
	ny: number;
	dx: number;
	dt: number;
	g: number;
	manning: number;
	relaxW: number;
	relaxMax: number;
	spongeW: number;
	spongeRate: number;
	breakH: number;
	froudeT: number;
	steepT: number;
	depthLimT: number;
	foamDecay: number;
	envPeriod: number;
	envDepth: number;
	substeps: number;
	rotationDeg: number;
	foamThreshold: number;
}

export function resolveParams(o: SolverOptions): Params {
	const dt = o.dt ?? 0.12;
	return {
		nx: o.nx,
		ny: o.ny,
		dx: o.dx,
		dt,
		g: G,
		manning: o.manning ?? 0.025,
		relaxW: o.wavemaker?.width ?? 6,
		relaxMax: o.wavemaker?.strength ?? 0.9,
		spongeW: o.sponge?.width ?? 12,
		spongeRate: o.sponge?.rate ?? 0.06,
		breakH: o.breaking?.maxDepth ?? 7,
		froudeT: o.breaking?.froude ?? 0.3,
		steepT: o.breaking?.steepness ?? 0.1,
		depthLimT: o.breaking?.depthRatio ?? 0.22,
		foamDecay: Math.exp(-dt / (o.breaking?.foamTau ?? 6)),
		envPeriod: o.envelope?.period ?? 45,
		envDepth: o.envelope?.depth ?? 0,
		substeps: o.substeps ?? 3,
		rotationDeg: o.rotationDeg ?? 0,
		foamThreshold: o.foamThreshold ?? 0.15
	};
}

/** Mean wet depth across the wavemaker band: the d0 that sets the swell wavenumbers. */
export function wavemakerDepth(depth: Float32Array, nx: number, ny: number, width: number): number {
	let acc = 0;
	let n = 0;
	for (let ix = Math.max(0, nx - Math.ceil(width)); ix < nx; ix++) {
		for (let iy = 0; iy < ny; iy++) {
			const d = depth[ix * ny + iy];
			if (d > 0.5) {
				acc += d;
				n++;
			}
		}
	}
	return n ? acc / n : 10;
}

export function componentsFor(o: SolverOptions, p: Params, depth: Float32Array): WaveComponent[] {
	return swellComponents(o.swell, wavemakerDepth(depth, p.nx, p.ny, p.relaxW), p.rotationDeg);
}

/**
 * A stable time step for the unsplit first-order scheme: keeps
 * (|u| + c) dt / dx below ~0.2 per direction at the deepest cell plus a
 * crest of Hs. Run C's 0.12 s at 12.5 m and 37 m depth corresponds to 0.19.
 */
export function suggestDt(maxDepth: number, dx: number, Hs = 3): number {
	const c = Math.sqrt(G * (Math.max(maxDepth, 1) + Hs));
	return (0.2 * dx) / c;
}

export const PARAMS_BYTES = 80;
export const COMP_BYTES = 32;

export function packParams(p: Params, t: number, ncomp: number, dv: DataView, off = 0) {
	const u = [p.nx, p.ny, ncomp, 0];
	const f = [
		p.dx, p.dt, p.g, p.manning,
		t, p.relaxW, p.relaxMax, p.spongeW,
		p.spongeRate, p.breakH, p.froudeT, p.steepT,
		p.depthLimT, p.foamDecay, p.envPeriod, p.envDepth
	];
	u.forEach((v, i) => dv.setUint32(off + i * 4, v, true));
	f.forEach((v, i) => dv.setFloat32(off + 16 + i * 4, v, true));
}

export function packComponents(comps: WaveComponent[]): Float32Array {
	const a = new Float32Array(Math.max(1, comps.length) * 8);
	comps.forEach((c, i) => a.set([c.kx, c.ky, c.omega, c.amp, c.phase, 0, 0, 0], i * 8));
	return a;
}

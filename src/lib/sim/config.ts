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
	/**
	 * 'muscl' (default): second-order MUSCL-MC reconstruction with SSP-RK2, the
	 * Run A scheme. 'first-order': Run C's single-stage HLL, about 4x cheaper
	 * per step but too diffusive to carry swell more than a few hundred metres.
	 */
	scheme?: 'muscl' | 'first-order';
	/**
	 * time step (s); default suggestDt(max depth, dx) at Courant 0.4 for
	 * 'muscl' (Run A's CFL) and 0.2 for 'first-order' (Run C's 0.12 s at 12.5 m)
	 */
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
	/**
	 * Breaking trigger and foam. A cell breaks when minDepth < h < maxDepth and
	 * any threshold is exceeded. Defaults depend on the scheme, see
	 * breakingDefaults.
	 */
	breaking?: Breaking;
	/** slow set/lull envelope on the wavemaker: period (s) and depth 0..1; default off */
	envelope?: { period?: number; depth?: number };
	/** foam level counted as "covered" by the statistics pass; default 0.15 */
	foamThreshold?: number;
}

export interface Breaking {
	/** only break where depth < this (m) */
	maxDepth?: number;
	/** and depth > this (m) */
	minDepth?: number;
	/** Froude number threshold */
	froude?: number;
	/** surface slope threshold */
	steepness?: number;
	/** crest elevation over depth threshold (use Infinity to disable) */
	depthRatio?: number;
	/** foam e-folding time (s) */
	foamTau?: number;
}

/**
 * Default breaking thresholds.
 *
 * first-order: Run C's loosened visual thresholds (its swell never got steep
 * enough for real ones).
 *
 * muscl: Run A's criterion (depth < 5 m and steepness > 0.40 or Froude >
 * 0.60, foam half-life 4 s) with the Froude threshold scaled to the grid:
 * 0.65 - 0.024 dx, clamped to [0.3, 0.6]. A coarse grid smears a bore over
 * more metres, so its peak Froude number is lower. The rule gives 0.59 at Run
 * A's 2.5 m and matches Run A's foam coverage on J-Bay at 6.25 m (0.50) and
 * 12.5 m (0.35); see PARITY.md. Steepness rarely fires below 2.5 m cells.
 */
export function breakingDefaults(scheme: 'muscl' | 'first-order', dx: number): Required<Breaking> {
	if (scheme === 'first-order') {
		return { maxDepth: 7, minDepth: 0.05, froude: 0.3, steepness: 0.1, depthRatio: 0.22, foamTau: 6 };
	}
	const froude = Math.min(0.6, Math.max(0.3, 0.65 - 0.024 * dx));
	return { maxDepth: 5, minDepth: 0.2, froude, steepness: 0.4, depthRatio: Infinity, foamTau: 4 / Math.LN2 };
}

export interface Params {
	scheme: 'muscl' | 'first-order';
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
	breakHmin: number;
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
	const scheme = o.scheme ?? 'muscl';
	let maxDepth = 1;
	for (let i = 0; i < o.depth.length; i++) if (o.depth[i] > maxDepth) maxDepth = o.depth[i];
	const dt = o.dt ?? suggestDt(maxDepth, o.dx, 3, scheme === 'muscl' ? 0.4 : 0.2);
	const b = { ...breakingDefaults(scheme, o.dx), ...o.breaking };
	return {
		scheme,
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
		breakH: b.maxDepth,
		breakHmin: b.minDepth,
		froudeT: b.froude,
		steepT: b.steepness,
		depthLimT: Math.min(b.depthRatio, 1e30),
		foamDecay: Math.exp(-dt / b.foamTau),
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
 * A time step that keeps the Courant number c dt / dx at `courant` for the
 * deepest cell plus a crest of Hs. Run A ran MUSCL at 0.4; Run C's first-order
 * 0.12 s at 12.5 m and 37 m depth is 0.19. MUSCL at 0.4 was checked on J-Bay
 * against half that step: same statistics (PARITY.md).
 */
export function suggestDt(maxDepth: number, dx: number, Hs = 3, courant = 0.4): number {
	const c = Math.sqrt(G * (Math.max(maxDepth, 1) + Hs));
	return (courant * dx) / c;
}

export const PARAMS_BYTES = 80;
export const COMP_BYTES = 32;

export function packParams(p: Params, t: number, ncomp: number, dv: DataView, off = 0) {
	const u = [p.nx, p.ny, ncomp];
	const f = [
		p.dx, p.dt, p.g, p.manning,
		t, p.relaxW, p.relaxMax, p.spongeW,
		p.spongeRate, p.breakH, p.froudeT, p.steepT,
		p.depthLimT, p.foamDecay, p.envPeriod, p.envDepth
	];
	u.forEach((v, i) => dv.setUint32(off + i * 4, v, true));
	dv.setFloat32(off + 12, p.breakHmin, true);
	f.forEach((v, i) => dv.setFloat32(off + 16 + i * 4, v, true));
}

export function packComponents(comps: WaveComponent[]): Float32Array {
	const a = new Float32Array(Math.max(1, comps.length) * 8);
	comps.forEach((c, i) => a.set([c.kx, c.ky, c.omega, c.amp, c.phase, 0, 0, 0], i * 8));
	return a;
}

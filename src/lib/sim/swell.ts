/**
 * Swell forcing: a directional JONSWAP sea broken into linear wave
 * components, ported from `surf-sim/solver/run_a2_2d.py:jonswap_components`.
 * Directions and frames are described in FRAME.md.
 */

export const G = 9.81;

export interface Swell {
	/** significant wave height at the wavemaker (m) */
	Hs: number;
	/** peak period (s) */
	Tp: number;
	/** compass direction the swell comes FROM (deg, 0 = north, 90 = east) */
	dirDeg: number;
	/** directional spread as the power n in cos^n(theta - theta0); Run A used 20. 0 = one direction */
	spread: number;
	/** JONSWAP peak enhancement (default 3.3) */
	gamma?: number;
	/** RNG seed for component phases (default 1234) */
	seed?: number;
	/** 'jonswap' (default) or 'mono': one regular wave of height Hs */
	spectrum?: 'jonswap' | 'mono';
}

export interface WaveComponent {
	/** wavenumber in grid coordinates (rad/m): kx along +ix, ky along +iy */
	kx: number;
	ky: number;
	omega: number;
	amp: number;
	phase: number;
}

/**
 * Propagation angle in the grid frame (rad, counter-clockwise from +ix) for a
 * compass FROM direction. With rotationDeg = 0 the grid is ENU and
 * theta = 270 - dirDeg (deg): Run A's theta0 = 150 deg is a swell from 120 deg.
 */
export function thetaFromCompass(dirDeg: number, rotationDeg = 0): number {
	return ((270 - dirDeg - rotationDeg) * Math.PI) / 180;
}

/** Inverse of thetaFromCompass, in degrees on [0, 360). */
export function compassFromTheta(thetaRad: number, rotationDeg = 0): number {
	const d = 270 - (thetaRad * 180) / Math.PI - rotationDeg;
	return ((d % 360) + 360) % 360;
}

/** numpy-compatible enough: a small deterministic PRNG (mulberry32). */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Wave components for a swell at a boundary of depth d0 (m). Wavenumbers use
 * the shallow-water relation k = omega / sqrt(g d0), consistent with the
 * non-dispersive solver (as Run A does). The phase RNG differs from numpy's,
 * so the exact sea state differs from Run A; its statistics do not.
 */
export function swellComponents(
	swell: Swell,
	d0: number,
	rotationDeg = 0,
	nf = 24,
	ndir = 13
): WaveComponent[] {
	const th0 = thetaFromCompass(swell.dirDeg, rotationDeg);
	const c0 = Math.sqrt(G * Math.max(d0, 0.5));
	if (swell.Hs <= 0) return [];
	if (swell.spectrum === 'mono') {
		const w = (2 * Math.PI) / swell.Tp;
		const k = w / c0;
		return [{ kx: k * Math.cos(th0), ky: k * Math.sin(th0), omega: w, amp: swell.Hs / 2, phase: 0 }];
	}
	const gamma = swell.gamma ?? 3.3;
	const fp = 1 / swell.Tp;
	const f: number[] = [];
	for (let i = 0; i < nf; i++) f.push(0.5 * fp + ((2.8 - 0.5) * fp * i) / (nf - 1));
	const df = f[1] - f[0];
	const S = f.map((fi) => {
		const sig = fi <= fp ? 0.07 : 0.09;
		const r = Math.exp(-((fi - fp) ** 2) / (2 * sig * sig * fp * fp));
		return fi ** -5 * Math.exp(-1.25 * (fp / fi) ** 4) * gamma ** r;
	});
	const m0 = S.reduce((a, s) => a + s * df, 0);
	for (let i = 0; i < nf; i++) S[i] *= (swell.Hs / 4) ** 2 / m0;

	let th: number[];
	let D: number[];
	let dth: number;
	if (swell.spread <= 0) {
		th = [th0];
		D = [1];
		dth = 1;
	} else {
		const half = (75 * Math.PI) / 180;
		th = [];
		for (let j = 0; j < ndir; j++) th.push(th0 - half + (2 * half * j) / (ndir - 1));
		dth = th[1] - th[0];
		D = th.map((t) => (Math.abs(t - th0) > Math.PI / 2 ? 0 : Math.cos(t - th0) ** swell.spread));
		const norm = D.reduce((a, d) => a + d * dth, 0);
		D = D.map((d) => d / norm);
	}
	const rand = rng(swell.seed ?? 1234);
	const out: WaveComponent[] = [];
	for (let i = 0; i < nf; i++) {
		const w = 2 * Math.PI * f[i];
		const k = w / c0;
		for (let j = 0; j < th.length; j++) {
			const a = Math.sqrt(2 * S[i] * df * D[j] * dth);
			if (a < 1e-4) continue;
			out.push({ kx: k * Math.cos(th[j]), ky: k * Math.sin(th[j]), omega: w, amp: a, phase: rand() * 2 * Math.PI });
		}
	}
	return out;
}

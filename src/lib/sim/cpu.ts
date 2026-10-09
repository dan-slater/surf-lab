/**
 * CPU twin of step.wgsl and fields.wgsl: the same scheme in TypeScript, for
 * tests under `bun test`, for parity runs without a GPU, and as a reference
 * when debugging the WGSL. State is stored in float32 like the GPU; arithmetic
 * runs in float64, so the two agree to rounding, not bit for bit.
 */
import { componentsFor, resolveParams, type Params, type SolverOptions } from './config';
import type { Swell, WaveComponent } from './swell';

export interface CpuSolver {
	readonly params: Params;
	readonly nx: number;
	readonly ny: number;
	/** (h, hu, hv, foam) per cell, idx = ix * ny + iy */
	readonly state: Float32Array;
	/** model time (s) */
	readonly time: number;
	step(substeps?: number): void;
	setSwell(swell: Swell): void;
	setDepth(depth: Float32Array): void;
	readEta(): Float32Array;
	readFoam(): Float32Array;
	startStats(): void;
	readStats(): { Hs: Float32Array; foamMean: Float32Array; foamFrac: Float32Array; samples: number };
}

export function createCpuSolver(opts: SolverOptions): CpuSolver {
	const p = resolveParams(opts);
	const { nx, ny } = p;
	const N = nx * ny;
	let opt = { ...opts };
	let zb = new Float32Array(N);
	let cur = new Float32Array(N * 4);
	let nxt = new Float32Array(N * 4);
	let t = 0;
	let comps: WaveComponent[] = [];
	// wavemaker cache: spatial phase per (band cell, component)
	let bandCells: number[] = [];
	const bandIndex = new Int32Array(N);
	let cosA = new Float64Array(0);
	let sinA = new Float64Array(0);
	const stats = new Float64Array(N * 4);
	let samples = 0;

	function rebuildWavemaker() {
		bandCells = [];
		bandIndex.fill(-1);
		for (let ix = 0; ix < nx; ix++) {
			const band = nx - 1 - ix;
			if (band >= p.relaxW) continue;
			for (let iy = 0; iy < ny; iy++) if (-zb[ix * ny + iy] > 0.5) bandCells.push(ix * ny + iy);
		}
		const nc = comps.length;
		cosA = new Float64Array(bandCells.length * nc);
		sinA = new Float64Array(bandCells.length * nc);
		bandCells.forEach((i, b) => {
			bandIndex[i] = b;
			const x = Math.floor(i / ny) * p.dx;
			const y = (i % ny) * p.dx;
			for (let c = 0; c < nc; c++) {
				const k = comps[c];
				const a = k.kx * x + k.ky * y + k.phase;
				cosA[b * nc + c] = Math.cos(a);
				sinA[b * nc + c] = Math.sin(a);
			}
		});
	}

	function setDepth(depth: Float32Array) {
		zb = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			zb[i] = -depth[i];
			cur[i * 4] = Math.max(0, depth[i]);
			cur[i * 4 + 1] = 0;
			cur[i * 4 + 2] = 0;
			cur[i * 4 + 3] = 0;
		}
		opt = { ...opt, depth };
		comps = componentsFor(opt, p, depth);
		rebuildWavemaker();
	}

	function setSwell(swell: Swell) {
		opt = { ...opt, swell };
		comps = componentsFor(opt, p, opt.depth);
		rebuildWavemaker();
	}

	const g = p.g;
	const vel = (m: number, h: number) => (h > 1e-3 ? m / h : 0);
	// HLL flux; n selects the normal momentum (1 = hu for x, 2 = hv for y)
	const F = new Float64Array(3);
	function flux(hL: number, huL: number, hvL: number, hR: number, huR: number, hvR: number, xdir: boolean, out: Float64Array, o: number) {
		if (hL <= 1e-4 && hR <= 1e-4) {
			out[o] = out[o + 1] = out[o + 2] = 0;
			return;
		}
		const uL = vel(huL, hL), uR = vel(huR, hR);
		const vL = vel(hvL, hL), vR = vel(hvR, hR);
		const cL = Math.sqrt(g * hL), cR = Math.sqrt(g * hR);
		const nL = xdir ? uL : vL, nR = xdir ? uR : vR;
		const SL = Math.min(nL - cL, nR - cR);
		const SR = Math.max(nL + cL, nR + cR);
		const mL = xdir ? huL : hvL, mR = xdir ? huR : hvR;
		const FL0 = mL, FR0 = mR;
		const FL1 = xdir ? huL * uL + 0.5 * g * hL * hL : hvL * uL;
		const FR1 = xdir ? huR * uR + 0.5 * g * hR * hR : hvR * uR;
		const FL2 = xdir ? huL * vL : hvL * vL + 0.5 * g * hL * hL;
		const FR2 = xdir ? huR * vR : hvR * vR + 0.5 * g * hR * hR;
		if (SL >= 0) {
			out[o] = FL0; out[o + 1] = FL1; out[o + 2] = FL2;
			return;
		}
		if (SR <= 0) {
			out[o] = FR0; out[o + 1] = FR1; out[o + 2] = FR2;
			return;
		}
		const inv = 1 / (SR - SL);
		out[o] = (SR * FL0 - SL * FR0 + SL * SR * (hR - hL)) * inv;
		out[o + 1] = (SR * FL1 - SL * FR1 + SL * SR * (huR - huL)) * inv;
		out[o + 2] = (SR * FL2 - SL * FR2 + SL * SR * (hvR - hvL)) * inv;
	}

	const fl = new Float64Array(12); // Fp, Fm, Gp, Gm
	function stepOnce() {
		t += p.dt;
		const r = p.dt / p.dx;
		const nc = comps.length;
		// wavemaker time factors
		const cw = new Float64Array(nc), sw = new Float64Array(nc);
		for (let c = 0; c < nc; c++) {
			cw[c] = Math.cos(comps[c].omega * t);
			sw[c] = Math.sin(comps[c].omega * t);
		}
		const env = 1 + p.envDepth * 0.5 * (Math.sin((2 * Math.PI * t) / Math.max(p.envPeriod, 1)) - 1);
		const s = cur;
		for (let ix = 0; ix < nx; ix++) {
			const ixR = Math.min(ix + 1, nx - 1), ixL = Math.max(ix - 1, 0);
			for (let iy = 0; iy < ny; iy++) {
				const iyU = Math.min(iy + 1, ny - 1), iyD = Math.max(iy - 1, 0);
				const iC = ix * ny + iy, iR = ixR * ny + iy, iL = ixL * ny + iy, iU = ix * ny + iyU, iD = ix * ny + iyD;
				const h = s[iC * 4], hu = s[iC * 4 + 1], hv = s[iC * 4 + 2], foam = s[iC * 4 + 3];
				const zbC = zb[iC], zbR = zb[iR], zbL = zb[iL], zbU = zb[iU], zbD = zb[iD];
				const hR_ = s[iR * 4], hL_ = s[iL * 4], hU_ = s[iU * 4], hD_ = s[iD * 4];
				const etaC = h + zbC, etaR = hR_ + zbR, etaL = hL_ + zbL, etaU = hU_ + zbU, etaD = hD_ + zbD;
				const uC = vel(hu, h), vC = vel(hv, h);
				const uR = vel(s[iR * 4 + 1], hR_), vR = vel(s[iR * 4 + 2], hR_);
				const uL = vel(s[iL * 4 + 1], hL_), vL = vel(s[iL * 4 + 2], hL_);
				const uU = vel(s[iU * 4 + 1], hU_), vU = vel(s[iU * 4 + 2], hU_);
				const uD = vel(s[iD * 4 + 1], hD_), vD = vel(s[iD * 4 + 2], hD_);

				const zbfR = Math.max(zbC, zbR);
				const hCp = Math.max(0, etaC - zbfR), hRp = Math.max(0, etaR - zbfR);
				flux(hCp, hCp * uC, hCp * vC, hRp, hRp * uR, hRp * vR, true, fl, 0);
				const zbfL = Math.max(zbL, zbC);
				const hLm = Math.max(0, etaL - zbfL), hCm = Math.max(0, etaC - zbfL);
				flux(hLm, hLm * uL, hLm * vL, hCm, hCm * uC, hCm * vC, true, fl, 3);
				const zbfU = Math.max(zbC, zbU);
				const hCu = Math.max(0, etaC - zbfU), hUu = Math.max(0, etaU - zbfU);
				flux(hCu, hCu * uC, hCu * vC, hUu, hUu * uU, hUu * vU, false, fl, 6);
				const zbfD = Math.max(zbD, zbC);
				const hDd = Math.max(0, etaD - zbfD), hCd = Math.max(0, etaC - zbfD);
				flux(hDd, hDd * uD, hDd * vD, hCd, hCd * uC, hCd * vC, false, fl, 9);

				let nh = h - r * (fl[0] - fl[3] + (fl[6] - fl[9]));
				let nhu = hu - r * (fl[1] - fl[4] + (fl[7] - fl[10]));
				let nhv = hv - r * (fl[2] - fl[5] + (fl[8] - fl[11]));
				nhu -= r * (0.5 * g * (hCm * hCm - hCp * hCp));
				nhv -= r * (0.5 * g * (hCd * hCd - hCu * hCu));

				if (nh < 1e-3) {
					nh = Math.max(nh, 0); nhu = 0; nhv = 0;
				} else {
					const u = nhu / nh, v = nhv / nh, sp = Math.sqrt(u * u + v * v);
					const cf = (g * p.manning * p.manning * sp) / Math.pow(nh, 4 / 3);
					const den = 1 + p.dt * cf;
					nhu /= den; nhv /= den;
				}

				const fR = s[iR * 4 + 3], fL = s[iL * 4 + 3], fU = s[iU * 4 + 3], fD = s[iD * 4 + 3];
				const fx = uC > 0 ? uC * (foam - fL) : uC * (fR - foam);
				const fy = vC > 0 ? vC * (foam - fD) : vC * (fU - foam);
				let nf = (foam - r * (fx + fy)) * p.foamDecay;
				if (nh > 0.05 && nh < p.breakH) {
					const u = vel(nhu, nh), v = vel(nhv, nh), sp = Math.sqrt(u * u + v * v);
					const froude = sp / Math.sqrt(g * nh);
					const steep = (0.5 * Math.sqrt((etaR - etaL) ** 2 + (etaU - etaD) ** 2)) / p.dx;
					const depthLim = etaC / nh;
					if (froude > p.froudeT || steep > p.steepT || depthLim > p.depthLimT) nf = Math.max(nf, 1);
				}
				nf = Math.min(1, Math.max(0, nf));

				const dC = -zbC;
				const band = nx - 1 - ix;
				if (band < p.relaxW && dC > 0.5) {
					const b = bandIndex[iC];
					const c0 = Math.sqrt(g / dC);
					let etaT = 0, uT = 0, vT = 0;
					for (let c = 0; c < nc; c++) {
						const k = comps[c];
						const e = env * k.amp * (cosA[b * nc + c] * cw[c] + sinA[b * nc + c] * sw[c]);
						const km = Math.sqrt(k.kx * k.kx + k.ky * k.ky) + 1e-9;
						etaT += e;
						uT += (e * c0 * k.kx) / km;
						vT += (e * c0 * k.ky) / km;
					}
					const hT = Math.max(0, dC + etaT);
					const a = p.relaxMax * (1 - band / p.relaxW);
					nh += a * (hT - nh);
					nhu += a * (hT * uT - nhu);
					nhv += a * (hT * vT - nhv);
				}

				const sN = iy, sS = ny - 1 - iy;
				let damp = 0;
				if (sN < p.spongeW) damp = Math.max(damp, 1 - sN / p.spongeW);
				if (sS < p.spongeW) damp = Math.max(damp, 1 - sS / p.spongeW);
				if (damp > 0 && dC > 0.5) {
					const b = p.spongeRate * damp;
					nhu *= 1 - b;
					nhv *= 1 - b;
					nh += b * 0.5 * (dC - nh);
				}
				nxt[iC * 4] = nh;
				nxt[iC * 4 + 1] = nhu;
				nxt[iC * 4 + 2] = nhv;
				nxt[iC * 4 + 3] = nf;
			}
		}
		const tmp = cur;
		cur = nxt;
		nxt = tmp;
	}

	function accumulate() {
		for (let i = 0; i < N; i++) {
			const h = cur[i * 4];
			const eta = h > 1e-3 && zb[i] < 0 ? h + zb[i] : 0;
			const f = cur[i * 4 + 3];
			stats[i * 4] += eta;
			stats[i * 4 + 1] += eta * eta;
			stats[i * 4 + 2] += f;
			stats[i * 4 + 3] += f > p.foamThreshold ? 1 : 0;
		}
		samples++;
	}
	let statsOn = false;

	setDepth(opts.depth);

	return {
		params: p,
		nx,
		ny,
		get state() {
			return cur;
		},
		get time() {
			return t;
		},
		step(n = p.substeps) {
			for (let k = 0; k < n; k++) {
				stepOnce();
				if (statsOn) accumulate();
			}
		},
		setSwell,
		setDepth(depth: Float32Array) {
			t = 0;
			setDepth(depth);
		},
		readEta() {
			const out = new Float32Array(N);
			for (let i = 0; i < N; i++) out[i] = cur[i * 4] > 1e-3 && zb[i] < 0 ? cur[i * 4] + zb[i] : 0;
			return out;
		},
		readFoam() {
			const out = new Float32Array(N);
			for (let i = 0; i < N; i++) out[i] = cur[i * 4 + 3];
			return out;
		},
		startStats() {
			stats.fill(0);
			samples = 0;
			statsOn = true;
		},
		readStats() {
			return statsFromSums(stats, N, samples);
		}
	};
}

/** Turn per-cell sums (eta, eta^2, foam, foam hits) into Hs and foam maps. */
export function statsFromSums(sums: ArrayLike<number>, n: number, samples: number) {
	const Hs = new Float32Array(n);
	const foamMean = new Float32Array(n);
	const foamFrac = new Float32Array(n);
	const k = Math.max(samples, 1);
	for (let i = 0; i < n; i++) {
		const m = sums[i * 4] / k;
		const v = Math.max(0, sums[i * 4 + 1] / k - m * m);
		Hs[i] = 4 * Math.sqrt(v);
		foamMean[i] = sums[i * 4 + 2] / k;
		foamFrac[i] = sums[i * 4 + 3] / k;
	}
	return { Hs, foamMean, foamFrac, samples };
}

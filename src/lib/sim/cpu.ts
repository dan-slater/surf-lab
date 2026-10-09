/**
 * CPU twin of the WGSL kernels (common.wgsl, step.wgsl, muscl.wgsl,
 * fields.wgsl): the same schemes in TypeScript, for tests under `bun test`,
 * for parity runs without a GPU, and as a reference when debugging the WGSL.
 * State is stored in float32 like the GPU; arithmetic runs in float64, so the
 * two agree to rounding, not bit for bit. Change both together.
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

const HWET = 0.1; // MUSCL drops to first order next to cells shallower than this (m)
const DRY = 1e-4; // RK stages zero the momentum below this depth (m)

/** MC (monotonised central) limited slope. Zero at rest, so well-balanced. */
function slope(qm: number, q0: number, qp: number): number {
	const a = qp - q0;
	const b = q0 - qm;
	if (a * b <= 0) return 0;
	const c = 0.5 * (a + b);
	return (c > 0 ? 1 : -1) * Math.min(2 * Math.abs(a), 2 * Math.abs(b), Math.abs(c));
}

export function createCpuSolver(opts: SolverOptions): CpuSolver {
	const p = resolveParams(opts);
	const { nx, ny } = p;
	const N = nx * ny;
	const g = p.g;
	let opt = { ...opts };
	let zb = new Float32Array(N);
	let cur = new Float32Array(N * 4);
	let nxt = new Float32Array(N * 4);
	const stage = new Float32Array(N * 4);
	let t = 0;
	let comps: WaveComponent[] = [];
	// wavemaker cache: spatial phase per (band cell, component)
	let bandCells: number[] = [];
	const bandIndex = new Int32Array(N);
	let cosA = new Float64Array(0);
	let sinA = new Float64Array(0);
	const stats = new Float64Array(N * 4);
	let samples = 0;
	let statsOn = false;

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

	const vel = (m: number, h: number) => (h > 1e-3 ? m / h : 0);

	// ---------------------------------------------------------------- first order (step.wgsl)
	// HLL flux; xdir selects the normal momentum (hu for x faces, hv for y faces)
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
		const FL0 = xdir ? huL : hvL, FR0 = xdir ? huR : hvR;
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

	const fl = new Float64Array(12);
	/** First-order update of cell (ix, iy) from s; returns via upd[0..2]. */
	function firstOrder(s: Float32Array, ix: number, iy: number, upd: Float64Array) {
		const r = p.dt / p.dx;
		const ixR = Math.min(ix + 1, nx - 1), ixL = Math.max(ix - 1, 0);
		const iyU = Math.min(iy + 1, ny - 1), iyD = Math.max(iy - 1, 0);
		const iC = ix * ny + iy, iR = ixR * ny + iy, iL = ixL * ny + iy, iU = ix * ny + iyU, iD = ix * ny + iyD;
		const h = s[iC * 4], hu = s[iC * 4 + 1], hv = s[iC * 4 + 2];
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

		upd[0] = h - r * (fl[0] - fl[3] + (fl[6] - fl[9]));
		upd[1] = hu - r * (fl[1] - fl[4] + (fl[7] - fl[10])) - r * (0.5 * g * (hCm * hCm - hCp * hCp));
		upd[2] = hv - r * (fl[2] - fl[5] + (fl[8] - fl[11])) - r * (0.5 * g * (hCd * hCd - hCu * hCu));
	}

	// ---------------------------------------------------------------- MUSCL (muscl.wgsl)
	// Port of surf-sim/solver/swe2d.py compute_L: MC-limited reconstruction of
	// (w = h + zb, zb, u, v), first order next to cells shallower than HWET,
	// Audusse hydrostatic reconstruction on the face states, HLL flux.
	const W = new Float64Array(N), U = new Float64Array(N), V = new Float64Array(N), H = new Float64Array(N);
	const cl = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);
	/** Reconstruct cell (ix, iy) toward its side (+1 / -1) along x or y into rc[o..o+3] = w, zb, u, v */
	function recon(ix: number, iy: number, side: number, xdir: boolean, rc: Float64Array, o: number) {
		let im: number, i0: number, ip: number;
		if (xdir) {
			const j = cl(iy, ny);
			im = cl(ix - 1, nx) * ny + j; i0 = cl(ix, nx) * ny + j; ip = cl(ix + 1, nx) * ny + j;
		} else {
			const i = cl(ix, nx) * ny;
			im = i + cl(iy - 1, ny); i0 = i + cl(iy, ny); ip = i + cl(iy + 1, ny);
		}
		const f = H[im] < HWET || H[i0] < HWET || H[ip] < HWET ? 0 : 0.5 * side;
		rc[o] = W[i0] + f * slope(W[im], W[i0], W[ip]);
		rc[o + 1] = zb[i0] + f * slope(zb[im], zb[i0], zb[ip]);
		rc[o + 2] = U[i0] + f * slope(U[im], U[i0], U[ip]);
		rc[o + 3] = V[i0] + f * slope(V[im], V[i0], V[ip]);
	}
	/** HLL for a face from reconstructed normal/transverse velocities: out = Fm, Fn, Ft, srcL, srcR */
	function hll(hsL: number, unL: number, utL: number, hsR: number, unR: number, utR: number, heL: number, heR: number, out: Float64Array) {
		const cL = Math.sqrt(g * hsL), cR = Math.sqrt(g * hsR);
		const SL = Math.min(unL - cL, unR - cR, 0);
		const SR = Math.max(unL + cL, unR + cR, 0);
		out[0] = out[1] = out[2] = 0;
		if (SR - SL > 1e-8) {
			const inv = 1 / (SR - SL);
			const FLm = hsL * unL, FRm = hsR * unR;
			const FLn = hsL * unL * unL + 0.5 * g * hsL * hsL, FRn = hsR * unR * unR + 0.5 * g * hsR * hsR;
			const FLt = hsL * unL * utL, FRt = hsR * unR * utR;
			out[0] = (SR * FLm - SL * FRm + SL * SR * (hsR - hsL)) * inv;
			out[1] = (SR * FLn - SL * FRn + SL * SR * (hsR * unR - hsL * unL)) * inv;
			out[2] = (SR * FLt - SL * FRt + SL * SR * (hsR * utR - hsL * utL)) * inv;
		}
		out[3] = 0.5 * g * (heL * heL - hsL * hsL);
		out[4] = 0.5 * g * (heR * heR - hsR * hsR);
	}
	const rcL = new Float64Array(4), rcR = new Float64Array(4);
	/** One face: L state from cell a toward +side, R state from cell b toward -side. Returns the near-edge beds. */
	function face(ax: number, ay: number, bx: number, by: number, xdir: boolean, out: Float64Array): [number, number] {
		recon(ax, ay, 1, xdir, rcL, 0);
		recon(bx, by, -1, xdir, rcR, 0);
		const heL = Math.max(0, rcL[0] - rcL[1]), heR = Math.max(0, rcR[0] - rcR[1]);
		const zst = Math.max(rcL[1], rcR[1]);
		const hsL = Math.max(0, rcL[0] - zst), hsR = Math.max(0, rcR[0] - zst);
		// normal velocity is u on x faces, v on y faces
		if (xdir) hll(hsL, rcL[2], rcL[3], hsR, rcR[2], rcR[3], heL, heR, out);
		else hll(hsL, rcL[3], rcL[2], hsR, rcR[3], rcR[2], heL, heR, out);
		return [rcL[1], rcR[1]];
	}
	// Face fluxes computed once per stage (the GPU kernel recomputes them per
	// cell; the arithmetic is the same). Per face: Fm, Fn, Ft, srcL, srcR, zbL, zbR.
	const FX = new Float64Array((nx + 1) * ny * 7);
	const FY = new Float64Array(nx * (ny + 1) * 7);
	const ftmp = new Float64Array(5);
	function faces() {
		for (let i = 0; i <= nx; i++)
			for (let j = 0; j < ny; j++) {
				const [zl, zr] = face(i - 1, j, i, j, true, ftmp);
				const o = (i * ny + j) * 7;
				FX.set(ftmp, o);
				FX[o + 5] = zl;
				FX[o + 6] = zr;
			}
		for (let i = 0; i < nx; i++)
			for (let j = 0; j <= ny; j++) {
				const [zl, zr] = face(i, j - 1, i, j, false, ftmp);
				const o = (i * (ny + 1) + j) * 7;
				FY.set(ftmp, o);
				FY[o + 5] = zl;
				FY[o + 6] = zr;
			}
	}
	/** L(U) of cell (ix, iy) into rate[0..2]; faces() must have run on the source state. */
	function rateMuscl(ix: number, iy: number, rate: Float64Array) {
		const dx = p.dx;
		const hc = H[ix * ny + iy];
		const e = ((ix + 1) * ny + iy) * 7, w = (ix * ny + iy) * 7;
		const n = (ix * (ny + 1) + iy + 1) * 7, so = (ix * (ny + 1) + iy) * 7;
		rate[0] = -(FX[e] - FX[w]) / dx - (FY[n] - FY[so]) / dx;
		const bsx = -FX[e + 3] + FX[w + 4] - g * hc * (FX[e + 5] - FX[w + 6]);
		rate[1] = -(FX[e + 1] - FX[w + 1]) / dx - (FY[n + 2] - FY[so + 2]) / dx + bsx / dx;
		const bsy = -FY[n + 3] + FY[so + 4] - g * hc * (FY[n + 5] - FY[so + 6]);
		rate[2] = -(FX[e + 2] - FX[w + 2]) / dx - (FY[n + 1] - FY[so + 1]) / dx + bsy / dx;
	}
	function loadPrims(s: Float32Array) {
		for (let i = 0; i < N; i++) {
			const h = s[i * 4];
			H[i] = h;
			W[i] = h + zb[i];
			U[i] = h > DRY ? s[i * 4 + 1] / h : 0;
			V[i] = h > DRY ? s[i * 4 + 2] / h : 0;
		}
	}

	// ---------------------------------------------------------------- shared finish (common.wgsl)
	/**
	 * Friction, foam, breaking, wavemaker and sponge for cell (ix, iy), given
	 * the flux update (nh, nhu, nhv) and the state at the start of the step
	 * `s` (foam transport and the breaking slope use it). Writes into nxt.
	 */
	function finish(s: Float32Array, ix: number, iy: number, nh: number, nhu: number, nhv: number, wt: Float64Array, env: number) {
		const r = p.dt / p.dx;
		const ixR = Math.min(ix + 1, nx - 1), ixL = Math.max(ix - 1, 0);
		const iyU = Math.min(iy + 1, ny - 1), iyD = Math.max(iy - 1, 0);
		const iC = ix * ny + iy, iR = ixR * ny + iy, iL = ixL * ny + iy, iU = ix * ny + iyU, iD = ix * ny + iyD;
		const h = s[iC * 4], foam = s[iC * 4 + 3];
		const zbC = zb[iC];
		const etaC = h + zbC;
		const etaR = s[iR * 4] + zb[iR], etaL = s[iL * 4] + zb[iL], etaU = s[iU * 4] + zb[iU], etaD = s[iD * 4] + zb[iD];
		const uC = vel(s[iC * 4 + 1], h), vC = vel(s[iC * 4 + 2], h);

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
		if (nh > p.breakHmin && nh < p.breakH) {
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
			const nc = comps.length;
			const c0 = Math.sqrt(g / dC);
			let etaT = 0, uT = 0, vT = 0;
			for (let c = 0; c < nc; c++) {
				const k = comps[c];
				const e = env * k.amp * (cosA[b * nc + c] * wt[c] + sinA[b * nc + c] * wt[nc + c]);
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

	const upd = new Float64Array(3);
	const rate = new Float64Array(3);
	function stepOnce() {
		t += p.dt;
		const nc = comps.length;
		const wt = new Float64Array(2 * nc);
		for (let c = 0; c < nc; c++) {
			wt[c] = Math.cos(comps[c].omega * t);
			wt[nc + c] = Math.sin(comps[c].omega * t);
		}
		const env = 1 + p.envDepth * 0.5 * (Math.sin((2 * Math.PI * t) / Math.max(p.envPeriod, 1)) - 1);
		const s = cur;
		if (p.scheme === 'first-order') {
			for (let ix = 0; ix < nx; ix++)
				for (let iy = 0; iy < ny; iy++) {
					firstOrder(s, ix, iy, upd);
					finish(s, ix, iy, upd[0], upd[1], upd[2], wt, env);
				}
		} else {
			// SSP-RK2 stage 1: U1 = Un + dt L(Un)   (muscl.wgsl: stage1)
			loadPrims(s);
			faces();
			for (let ix = 0; ix < nx; ix++)
				for (let iy = 0; iy < ny; iy++) {
					const i = ix * ny + iy;
					rateMuscl(ix, iy, rate);
					let h = s[i * 4] + p.dt * rate[0];
					let hu = s[i * 4 + 1] + p.dt * rate[1];
					let hv = s[i * 4 + 2] + p.dt * rate[2];
					if (h < DRY) { h = Math.max(h, 0); hu = 0; hv = 0; }
					stage[i * 4] = h; stage[i * 4 + 1] = hu; stage[i * 4 + 2] = hv; stage[i * 4 + 3] = s[i * 4 + 3];
				}
			// stage 2: U = 0.5 Un + 0.5 (U1 + dt L(U1)), then finish   (muscl.wgsl: stage2)
			loadPrims(stage);
			faces();
			for (let ix = 0; ix < nx; ix++)
				for (let iy = 0; iy < ny; iy++) {
					const i = ix * ny + iy;
					rateMuscl(ix, iy, rate);
					let h = 0.5 * s[i * 4] + 0.5 * (stage[i * 4] + p.dt * rate[0]);
					let hu = 0.5 * s[i * 4 + 1] + 0.5 * (stage[i * 4 + 1] + p.dt * rate[1]);
					let hv = 0.5 * s[i * 4 + 2] + 0.5 * (stage[i * 4 + 2] + p.dt * rate[2]);
					if (h < DRY) { h = Math.max(h, 0); hu = 0; hv = 0; }
					finish(s, ix, iy, h, hu, hv, wt, env);
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

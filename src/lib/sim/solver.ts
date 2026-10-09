/**
 * The WebGPU shallow-water solver as a module. It runs on a device the caller
 * owns (a map-kit overlay's, or one from gpu.ts), owns its buffers and
 * pipelines, and draws nothing: a renderer reads `fields` (a texture) or
 * `buffers` directly. See FRAME.md for the grid frame and README.md for use.
 */
import commonWgsl from './common.wgsl?raw';
import stepWgsl from './step.wgsl?raw';
import musclWgsl from './muscl.wgsl?raw';
import fieldsWgsl from './fields.wgsl?raw';
import {
	COMP_BYTES,
	PARAMS_BYTES,
	Ramp,
	componentsFor,
	envelopeFor,
	packComponents,
	packParams,
	resolveParams,
	type Params,
	type SolverOptions
} from './config';
import { statsFromSums } from './cpu';
import { Governor, type BudgetLevel, type BudgetOptions } from './budget';
import { thetaFromCompass, type Swell } from './swell';

export type { SolverOptions } from './config';

const MAX_COMPONENTS = 512;
const SLOT = 256; // uniform dynamic-offset alignment
const MAX_BATCH = 64; // steps encoded per submit

export interface WaveStats {
	/** significant wave height 4 * std(eta) per cell (m), 0 on land */
	Hs: Float32Array;
	/** time-mean foam per cell, 0..1 */
	foamMean: Float32Array;
	/** fraction of samples with foam above the threshold */
	foamFrac: Float32Array;
	samples: number;
}

export interface SolverBudget {
	readonly governor: Governor;
	readonly level: BudgetLevel;
	/**
	 * One frame: advance by up to `modelSeconds` within the budget, then call
	 * `render` (the renderer's draw and anything else on the GPU), and time the
	 * GPU work to refine the plan. Returns the steps taken.
	 */
	frame(modelSeconds: number, realDt: number, render?: () => void): number;
}

export interface Solver {
	/** the device the solver was created on (owned by the caller, never destroyed here) */
	readonly device: GPUDevice;
	readonly params: Params;
	/** model time (s) */
	readonly time: number;
	/**
	 * rgba16float texture, width nx, height ny, texel (ix, iy) =
	 * (eta, h, foam, zb). Updated at the end of every step() call.
	 */
	readonly fields: GPUTexture;
	/** rgba16float, width nx, height ny, texel (ix, iy) = (u, v, 0, 0) in m/s along +ix, +iy */
	readonly flow: GPUTexture;
	/** raw buffers: state (h, hu, hv, foam) as vec4<f32> and bed zb as f32, idx = ix * ny + iy */
	readonly buffers: { state: GPUBuffer; bed: GPUBuffer };
	/** advance by `substeps` steps of dt (default from options) */
	step(substeps?: number): void;
	setSwell(swell: Swell): void;
	/**
	 * Spin the swell up from `level` (0 = flat) to full over `seconds`
	 * (default 20) of real time, or of model time with clock: 'model'. Call it
	 * after setDepth or on a new solver so a spot builds from flat.
	 */
	rampFrom(level?: number, opts?: { seconds?: number; clock?: 'real' | 'model' }): void;
	/** the current swell */
	readonly swell: Swell;
	/** unit travel direction of the swell in grid space (+ix, +iy) */
	swellDirection(): [number, number];
	/** replace the bathymetry and reset to still water */
	setDepth(depth: Float32Array): void;
	/** surface elevation (m) on wet cells, 0 on dry */
	readEta(): Promise<Float32Array>;
	readFoam(): Promise<Float32Array>;
	readState(): Promise<Float32Array>;
	/** zero the statistics and accumulate them on every step from now on */
	startStats(): void;
	stopStats(): void;
	readStats(): Promise<WaveStats>;
	/** a frame governor holding the solver and whatever `render` draws to `msPerFrame` of GPU time */
	budget(msPerFrame: number, opts?: BudgetOptions): SolverBudget;
	dispose(): void;
}

export function createSolver(device: GPUDevice, opts: SolverOptions): Solver {
	const p = resolveParams(opts);
	const { nx, ny } = p;
	const N = nx * ny;
	if (opts.depth.length !== N) throw new Error(`depth has ${opts.depth.length} cells, grid has ${N}`);
	let options = { ...opts };
	let t = 0;
	let ncomp = 0;
	let statsOn = false;
	let samples = 0;
	const ramp = new Ramp();

	const S = GPUBufferUsage.STORAGE;
	const bed = device.createBuffer({ size: N * 4, usage: S | GPUBufferUsage.COPY_DST });
	const stateA = device.createBuffer({ size: N * 16, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
	const stateB = device.createBuffer({ size: N * 16, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
	// RK stage U1 (MUSCL only)
	const stateS = device.createBuffer({ size: p.scheme === 'muscl' ? N * 16 : 16, usage: S });
	const comps = device.createBuffer({ size: MAX_COMPONENTS * COMP_BYTES, usage: S | GPUBufferUsage.COPY_DST });
	const stats = device.createBuffer({ size: N * 16, usage: S | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
	const params = device.createBuffer({ size: SLOT * MAX_BATCH, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const dims = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	const fields = device.createTexture({
		size: [nx, ny],
		format: 'rgba16float',
		usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
	});
	const flow = device.createTexture({
		size: [nx, ny],
		format: 'rgba16float',
		usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
	});
	{
		const d = new DataView(new ArrayBuffer(16));
		d.setUint32(0, nx, true);
		d.setUint32(4, ny, true);
		d.setFloat32(8, p.foamThreshold, true);
		device.queue.writeBuffer(dims, 0, d.buffer);
	}

	const C = GPUShaderStage.COMPUTE;
	const stepLayout = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: C, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: PARAMS_BYTES } },
			{ binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
			{ binding: 3, visibility: C, buffer: { type: 'storage' } },
			{ binding: 4, visibility: C, buffer: { type: 'read-only-storage' } },
			{ binding: 5, visibility: C, buffer: { type: 'read-only-storage' } }
		]
	});
	const fieldsLayout = device.createBindGroupLayout({
		entries: [
			{ binding: 0, visibility: C, buffer: { type: 'uniform' } },
			{ binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
			{ binding: 2, visibility: C, buffer: { type: 'read-only-storage' } },
			{ binding: 3, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } },
			{ binding: 4, visibility: C, buffer: { type: 'storage' } },
			{ binding: 5, visibility: C, storageTexture: { access: 'write-only', format: 'rgba16float' } }
		]
	});
	const stepModule = device.createShaderModule({
		code: commonWgsl + (p.scheme === 'muscl' ? musclWgsl : stepWgsl),
		label: p.scheme === 'muscl' ? 'muscl.wgsl' : 'step.wgsl'
	});
	const fieldsModule = device.createShaderModule({ code: fieldsWgsl, label: 'fields.wgsl' });
	const stepPL = device.createPipelineLayout({ bindGroupLayouts: [stepLayout] });
	const entries = p.scheme === 'muscl' ? ['stage1', 'stage2'] : ['step'];
	const stepPipes = entries.map((entryPoint) =>
		device.createComputePipeline({ layout: stepPL, compute: { module: stepModule, entryPoint } })
	);
	const fieldsPL = device.createPipelineLayout({ bindGroupLayouts: [fieldsLayout] });
	const packPipe = device.createComputePipeline({ layout: fieldsPL, compute: { module: fieldsModule, entryPoint: 'pack' } });
	const accPipe = device.createComputePipeline({ layout: fieldsPL, compute: { module: fieldsModule, entryPoint: 'accumulate' } });

	const stepBG = (src: GPUBuffer, dst: GPUBuffer, stg: GPUBuffer) =>
		device.createBindGroup({
			layout: stepLayout,
			entries: [
				{ binding: 0, resource: { buffer: params, size: PARAMS_BYTES } },
				{ binding: 1, resource: { buffer: bed } },
				{ binding: 2, resource: { buffer: src } },
				{ binding: 3, resource: { buffer: dst } },
				{ binding: 4, resource: { buffer: comps } },
				{ binding: 5, resource: { buffer: stg } }
			]
		});
	const fieldsBG = (src: GPUBuffer) =>
		device.createBindGroup({
			layout: fieldsLayout,
			entries: [
				{ binding: 0, resource: { buffer: dims } },
				{ binding: 1, resource: { buffer: bed } },
				{ binding: 2, resource: { buffer: src } },
				{ binding: 3, resource: fields.createView() },
				{ binding: 4, resource: { buffer: stats } },
				{ binding: 5, resource: flow.createView() }
			]
		});
	// bind groups per pass, for the current state in A and in B
	const passesFromA =
		p.scheme === 'muscl'
			? [stepBG(stateA, stateS, stateA), stepBG(stateA, stateB, stateS)]
			: [stepBG(stateA, stateB, stateA)];
	const passesFromB =
		p.scheme === 'muscl'
			? [stepBG(stateB, stateS, stateB), stepBG(stateB, stateA, stateS)]
			: [stepBG(stateB, stateA, stateB)];
	const fA = fieldsBG(stateA);
	const fB = fieldsBG(stateB);
	let curIsA = true;

	const WX = Math.ceil(nx / 16);
	const WY = Math.ceil(ny / 16);
	const slotBuf = new ArrayBuffer(SLOT * MAX_BATCH);
	const slotView = new DataView(slotBuf);

	function uploadComponents() {
		const c = componentsFor(options, p, options.depth).slice(0, MAX_COMPONENTS);
		ncomp = c.length;
		device.queue.writeBuffer(comps, 0, packComponents(c));
	}

	function setDepth(depth: Float32Array) {
		if (depth.length !== N) throw new Error(`depth has ${depth.length} cells, grid has ${N}`);
		options = { ...options, depth };
		const zb = new Float32Array(N);
		const init = new Float32Array(N * 4);
		for (let i = 0; i < N; i++) {
			zb[i] = -depth[i];
			init[i * 4] = Math.max(0, depth[i]);
		}
		device.queue.writeBuffer(bed, 0, zb);
		device.queue.writeBuffer(stateA, 0, init);
		curIsA = true;
		t = 0;
		uploadComponents();
		pack();
	}

	function pack() {
		const enc = device.createCommandEncoder();
		const pass = enc.beginComputePass();
		pass.setPipeline(packPipe);
		pass.setBindGroup(0, curIsA ? fA : fB);
		pass.dispatchWorkgroups(WX, WY);
		pass.end();
		device.queue.submit([enc.finish()]);
	}

	function step(n = p.substeps) {
		while (n > 0) {
			const k = Math.min(n, MAX_BATCH);
			const env = envelopeFor(options.swell, p);
			for (let i = 0; i < k; i++) {
				const ti = t + (i + 1) * p.dt;
				packParams(p, ti, ncomp, slotView, i * SLOT, env, ramp.factor(ti));
			}
			device.queue.writeBuffer(params, 0, slotBuf, 0, k * SLOT);
			const enc = device.createCommandEncoder();
			const pass = enc.beginComputePass();
			for (let i = 0; i < k; i++) {
				const groups = curIsA ? passesFromA : passesFromB;
				for (let pi = 0; pi < stepPipes.length; pi++) {
					pass.setPipeline(stepPipes[pi]);
					pass.setBindGroup(0, groups[pi], [i * SLOT]);
					pass.dispatchWorkgroups(WX, WY);
				}
				curIsA = !curIsA;
				if (statsOn) {
					pass.setPipeline(accPipe);
					pass.setBindGroup(0, curIsA ? fA : fB);
					pass.dispatchWorkgroups(WX, WY);
					samples++;
				}
			}
			pass.setPipeline(packPipe);
			pass.setBindGroup(0, curIsA ? fA : fB);
			pass.dispatchWorkgroups(WX, WY);
			pass.end();
			device.queue.submit([enc.finish()]);
			t += k * p.dt;
			n -= k;
		}
	}

	async function readBuffer(src: GPUBuffer, size: number): Promise<Float32Array> {
		const staging = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
		const enc = device.createCommandEncoder();
		enc.copyBufferToBuffer(src, 0, staging, 0, size);
		device.queue.submit([enc.finish()]);
		await staging.mapAsync(GPUMapMode.READ);
		const out = new Float32Array(staging.getMappedRange().slice(0));
		staging.unmap();
		staging.destroy();
		return out;
	}
	const readState = () => readBuffer(curIsA ? stateA : stateB, N * 16);

	setDepth(opts.depth);

	return {
		device,
		params: p,
		get time() {
			return t;
		},
		fields,
		flow,
		get buffers() {
			return { state: curIsA ? stateA : stateB, bed };
		},
		step,
		setSwell(swell: Swell) {
			options = { ...options, swell };
			uploadComponents();
		},
		get swell() {
			return options.swell;
		},
		rampFrom(level = 0, o: { seconds?: number; clock?: 'real' | 'model' } = {}) {
			ramp.from(level, o.seconds ?? 20, o.clock ?? 'real', t);
		},
		swellDirection() {
			const th = thetaFromCompass(options.swell.dirDeg, p.rotationDeg);
			return [Math.cos(th), Math.sin(th)] as [number, number];
		},
		setDepth,
		readState,
		async readEta() {
			const s = await readState();
			const d = options.depth;
			const out = new Float32Array(N);
			for (let i = 0; i < N; i++) out[i] = s[i * 4] > 1e-3 && d[i] > 0 ? s[i * 4] - d[i] : 0;
			return out;
		},
		async readFoam() {
			const s = await readState();
			const out = new Float32Array(N);
			for (let i = 0; i < N; i++) out[i] = s[i * 4 + 3];
			return out;
		},
		startStats() {
			device.queue.writeBuffer(stats, 0, new Float32Array(N * 4));
			samples = 0;
			statsOn = true;
		},
		stopStats() {
			statsOn = false;
		},
		async readStats() {
			const sums = await readBuffer(stats, N * 16);
			return statsFromSums(sums, N, samples);
		},
		budget(msPerFrame: number, opts: BudgetOptions = {}): SolverBudget {
			const gov = new Governor(msPerFrame, p.dt, opts);
			let inFlight = false;
			// the fixed latency of an onSubmittedWorkDone round trip, measured on an
			// idle queue and subtracted, so a fast GPU is not charged for it
			let latency = 0;
			(async () => {
				const v: number[] = [];
				for (let i = 0; i < 7; i++) {
					await device.queue.onSubmittedWorkDone();
					const a = performance.now();
					await device.queue.onSubmittedWorkDone();
					v.push(performance.now() - a);
				}
				latency = v.sort((x, y) => x - y)[3];
			})();
			return {
				governor: gov,
				get level() {
					return gov.level;
				},
				frame(modelSeconds: number, realDt: number, render?: () => void) {
					const n = gov.plan(modelSeconds);
					const t0 = performance.now();
					if (n > 0) step(n);
					// time this frame's GPU work unless the previous measurement is still out
					const measure = !inFlight;
					const done = measure ? device.queue.onSubmittedWorkDone().then(() => performance.now()) : null;
					render?.();
					if (measure && done) {
						inFlight = true;
						Promise.all([done, device.queue.onSubmittedWorkDone().then(() => performance.now())]).then(([a, b]) => {
							const stepMs = Math.max(0.01 * n, a - t0 - latency);
							gov.observe(stepMs, n, Math.max(stepMs, b - t0 - latency), realDt);
							inFlight = false;
						});
					}
					return n;
				}
			};
		},
		dispose() {
			for (const b of [bed, stateA, stateB, stateS, comps, stats, params, dims]) b.destroy();
			fields.destroy();
			flow.destroy();
		}
	};
}

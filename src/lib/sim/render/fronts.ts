/**
 * Breaking-front tracking for surfers. Each sample, a GPU pass finds, per
 * along-shore row, the seaward edge of fresh foam (fronts.wgsl); 32 bytes a
 * row are read back. On the CPU, rows with an edge are grouped into broken
 * sections, and the ends of each section are tracked from sample to sample.
 * An end that moves along shore, away from its section, is a peel front.
 */
import frontsWgsl from './fronts.wgsl?raw';
import { G } from '../swell';
import type { GridSpec } from '../bathy';
import type { Solver } from '../solver';

export interface Front {
	id: number;
	/** ENU position of the front (m) */
	x: number;
	y: number;
	/** unit direction the front is moving in, ENU */
	dir: [number, number];
	/** measured front speed (m/s), smoothed */
	speed: number;
	/** model seconds since this front was first seen */
	age: number;
	/** true when the front runs along shore away from its broken section: a peel */
	peeling: boolean;
	/** still-water depth at the front (m) */
	depth: number;
	/** unit travel direction of the breaking wave, ENU */
	waveDir: [number, number];
	/** peel angle between the crest and the line of breaking (rad) */
	alpha: number;
	/** P4 peel speed c / sin(alpha) (m/s), c = sqrt(g h) at the front */
	vp: number;
	/** vp within a surfer's reach (MAX_SURFER_SPEED) */
	makeable: boolean;
}

/** A generous top speed for a surfer down the line (m/s), as in P4. */
export const MAX_SURFER_SPEED = 11;

export interface TrackerOptions {
	/** foam level counted as freshly broken (default 0.8) */
	threshold?: number;
	/** minimum model seconds between samples (default 0.25) */
	interval?: number;
	/** the largest cross-shore jump (m) between neighbouring rows of one section (default 40) */
	maxJump?: number;
	/** sections shorter than this (m) are ignored (default 30) */
	minLength?: number;
	/** gaps up to this long (m) inside a section are bridged (default 20) */
	bridge?: number;
	/** an end must be tracked this long (s) before it counts as a peel (default 1) */
	minAge?: number;
}

interface Track {
	id: number;
	end: -1 | 1; // which end of its section: -1 the low-iy end, +1 the high-iy end
	x: number;
	y: number;
	vx: number;
	vy: number;
	born: number;
	seen: number;
	depth: number;
	wx: number;
	wy: number;
	alpha: number;
	c: number;
	samples: number;
	/** recent (t, x, y) for the velocity fit */
	hist: number[];
}

/** least-squares velocity over a track's recent history */
function fitVelocity(h: number[]): [number, number] {
	const n = h.length / 3;
	if (n < 2) return [0, 0];
	let st = 0, sx = 0, sy = 0;
	for (let i = 0; i < n; i++) {
		st += h[i * 3];
		sx += h[i * 3 + 1];
		sy += h[i * 3 + 2];
	}
	st /= n; sx /= n; sy /= n;
	let tt = 0, tx = 0, ty = 0;
	for (let i = 0; i < n; i++) {
		const dt = h[i * 3] - st;
		tt += dt * dt;
		tx += dt * (h[i * 3 + 1] - sx);
		ty += dt * (h[i * 3 + 2] - sy);
	}
	return tt > 0 ? [tx / tt, ty / tt] : [0, 0];
}

/** seconds of history used for the velocity fit */
const FIT_WINDOW = 1.5;

/**
 * The CPU half: turn per-row edge samples into tracked fronts. Pure, so it
 * runs in tests without a GPU.
 */
export class FrontCore {
	private tracks: Track[] = [];
	private nextId = 1;
	private lastTime = -Infinity;
	private readonly cosR: number;
	private readonly sinR: number;
	constructor(
		readonly grid: GridSpec,
		private o: Required<TrackerOptions>
	) {
		const r = (grid.rotationDeg * Math.PI) / 180;
		this.cosR = Math.cos(r);
		this.sinR = Math.sin(r);
	}

	private enu(ix: number, iy: number): [number, number] {
		const u = ix * this.grid.dx, v = iy * this.grid.dx;
		return [this.grid.origin[0] + u * this.cosR - v * this.sinR, this.grid.origin[1] + u * this.sinR + v * this.cosR];
	}
	private enuDir(gx: number, gy: number): [number, number] {
		return [gx * this.cosR - gy * this.sinR, gx * this.sinR + gy * this.cosR];
	}

	/**
	 * rows: 8 floats per along-shore row (see fronts.wgsl), time: model seconds.
	 */
	ingest(rows: Float32Array, time: number) {
		const ny = this.grid.ny;
		const dx = this.grid.dx;
		const jump = this.o.maxJump / dx;
		const bridge = Math.round(this.o.bridge / dx);
		const minRows = Math.max(2, Math.round(this.o.minLength / dx));
		// 1. sections: runs of rows with an edge and small cross-shore jumps
		type End = { end: -1 | 1; ix: number; iy: number; h: number; u: number; v: number; slope: number };
		const ends: End[] = [];
		let start = -1;
		const close = (a: number, b: number) => {
			if (b - a + 1 < minRows) return;
			const ix = (iy: number) => rows[iy * 8];
			const k = Math.min(3, b - a);
			// local slope of the breaker line, d(ix)/d(iy), at each end
			const sLo = (ix(a + k) - ix(a)) / Math.max(k, 1);
			const sHi = (ix(b) - ix(b - k)) / Math.max(k, 1);
			ends.push({ end: -1, ix: ix(a), iy: a, h: rows[a * 8 + 2], u: rows[a * 8 + 4], v: rows[a * 8 + 5], slope: sLo });
			ends.push({ end: 1, ix: ix(b), iy: b, h: rows[b * 8 + 2], u: rows[b * 8 + 4], v: rows[b * 8 + 5], slope: sHi });
		};
		// walk the rows; a section continues across gaps of up to `bridge` rows
		// as long as the cross-shore jump between its last row and the next is small
		let lastRow = -1;
		for (let iy = 0; iy < ny; iy++) {
			if (rows[iy * 8] < 0) continue;
			if (start >= 0 && (iy - lastRow - 1 > bridge || Math.abs(rows[iy * 8] - rows[lastRow * 8]) > jump)) {
				close(start, lastRow);
				start = -1;
			}
			if (start < 0) start = iy;
			lastRow = iy;
		}
		if (start >= 0) close(start, lastRow);
		start = -1;
		if (start >= 0) close(start, ny - 1);

		// 2. match ends to tracks by predicted position
		const dt = Number.isFinite(this.lastTime) ? Math.max(time - this.lastTime, 1e-3) : 0;
		const used = new Set<Track>();
		const reach = Math.max(4 * dx, 30 * Math.max(dt, 0.25));
		for (const e of ends) {
			const [x, y] = this.enu(e.ix, e.iy);
			let best: Track | null = null;
			let bd = reach;
			for (const t of this.tracks) {
				if (used.has(t) || t.end !== e.end) continue;
				const d = Math.hypot(t.x + t.vx * dt - x, t.y + t.vy * dt - y);
				if (d < bd) {
					bd = d;
					best = t;
				}
			}
			// wave travel and peel angle at the end, from the flow and the breaker line
			const sp = Math.hypot(e.u, e.v);
			const [wx, wy] = sp > 0.05 ? this.enuDir(e.u / sp, e.v / sp) : [0, 0];
			// breaker line tangent in grid space: (slope, 1)
			const tl = Math.hypot(e.slope, 1);
			const tgx = e.slope / tl, tgy = 1 / tl;
			// crest line is perpendicular to the travel direction
			const cgx = sp > 0.05 ? -e.v / sp : 0, cgy = sp > 0.05 ? e.u / sp : 1;
			const sinA = Math.min(1, Math.abs(cgx * tgy - cgy * tgx));
			const alpha = Math.asin(Math.max(sinA, 1e-3));
			const c = Math.sqrt(G * Math.max(e.h, 0.05));
			if (best) {
				used.add(best);
				best.hist.push(time, x, y);
				while (best.hist.length > 3 && time - best.hist[0] > FIT_WINDOW) best.hist.splice(0, 3);
				[best.vx, best.vy] = fitVelocity(best.hist);
				Object.assign(best, { x, y, seen: time, depth: e.h, wx, wy, alpha, c });
				best.samples++;
			} else {
				const t: Track = { id: this.nextId++, end: e.end, x, y, vx: 0, vy: 0, born: time, seen: time, depth: e.h, wx, wy, alpha, c, samples: 1, hist: [time, x, y] };
				this.tracks.push(t);
				used.add(t);
			}
		}
		// 3. forget ends not seen for a while
		this.tracks = this.tracks.filter((t) => time - t.seen < 1.0);
		this.lastTime = time;
	}

	fronts(): Front[] {
		const out: Front[] = [];
		for (const t of this.tracks) {
			const speed = Math.hypot(t.vx, t.vy);
			// along-shore unit vector (grid +iy) in ENU, pointing away from the section
			const [ax, ay] = this.enuDir(0, t.end);
			const along = speed > 0 ? (t.vx * ax + t.vy * ay) / speed : 0;
			const peeling = t.seen - t.born >= this.o.minAge && speed > 2 && speed < 20 && along > 0.7;
			const dir: [number, number] = speed > 0.5 ? [t.vx / speed, t.vy / speed] : [ax, ay];
			const vp = t.c / Math.sin(t.alpha);
			out.push({
				id: t.id,
				x: t.x,
				y: t.y,
				dir,
				speed,
				age: t.seen - t.born,
				peeling,
				depth: t.depth,
				waveDir: [t.wx, t.wy],
				alpha: t.alpha,
				vp,
				makeable: vp <= MAX_SURFER_SPEED
			});
		}
		return out;
	}
}

export const TRACKER_DEFAULTS: Required<TrackerOptions> = {
	threshold: 0.8,
	interval: 0.25,
	maxJump: 40,
	minLength: 30,
	bridge: 20,
	minAge: 1
};

export interface FrontTracker {
	/** call once a frame; samples when the last readback is done and `interval` model seconds have passed */
	update(): void;
	/** fronts from the latest sample */
	fronts(): Front[];
	dispose(): void;
}

export function createFrontTracker(solver: Solver, grid: GridSpec, opts: TrackerOptions = {}): FrontTracker {
	const o: Required<TrackerOptions> = { ...TRACKER_DEFAULTS, ...opts };
	const device = solver.device;
	const { nx, ny } = solver.params;
	const core = new FrontCore(grid, o);
	const size = ny * 32;
	const uni = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
	{
		const d = new DataView(new ArrayBuffer(16));
		d.setUint32(0, nx, true);
		d.setUint32(4, ny, true);
		d.setUint32(8, Math.ceil(solver.params.relaxW), true);
		d.setFloat32(12, o.threshold, true);
		device.queue.writeBuffer(uni, 0, d.buffer);
	}
	const rows = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
	const staging = device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
	const module = device.createShaderModule({ code: frontsWgsl, label: 'fronts.wgsl' });
	const pipe = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'edges' } });
	const groups = new Map<GPUBuffer, GPUBindGroup>();
	const groupFor = (state: GPUBuffer, bed: GPUBuffer) => {
		let g = groups.get(state);
		if (!g) {
			g = device.createBindGroup({
				layout: pipe.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: { buffer: uni } },
					{ binding: 1, resource: { buffer: bed } },
					{ binding: 2, resource: { buffer: state } },
					{ binding: 3, resource: { buffer: rows } }
				]
			});
			groups.set(state, g);
		}
		return g;
	};
	let busy = false;
	let last = -Infinity;
	let dead = false;
	return {
		update() {
			if (busy || dead || solver.time - last < o.interval) return;
			busy = true;
			const t = solver.time;
			const { state, bed } = solver.buffers;
			const enc = device.createCommandEncoder();
			const pass = enc.beginComputePass();
			pass.setPipeline(pipe);
			pass.setBindGroup(0, groupFor(state, bed));
			pass.dispatchWorkgroups(Math.ceil(ny / 64));
			pass.end();
			enc.copyBufferToBuffer(rows, 0, staging, 0, size);
			device.queue.submit([enc.finish()]);
			staging.mapAsync(GPUMapMode.READ).then(
				() => {
					if (dead) return;
					core.ingest(new Float32Array(staging.getMappedRange().slice(0)), t);
					staging.unmap();
					last = t;
					busy = false;
				},
				() => (busy = false)
			);
		},
		fronts: () => core.fronts(),
		dispose() {
			dead = true;
			uni.destroy();
			rows.destroy();
			staging.destroy();
		}
	};
}

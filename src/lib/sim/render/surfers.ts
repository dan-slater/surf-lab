/**
 * Surfers: a small, deterministic crowd driven by the tracked breaking fronts
 * (fronts.ts) and drawn with the P6 rig (rig.ts) on a 2d canvas over the sea.
 *
 * Lifecycle: sit in the lineup just seaward of the break; take off when a
 * makeable peel front reaches them; ride the shoulder ahead of the front at up
 * to MAX_SURFER_SPEED; kick out when the front dies or runs away from them,
 * or wipe out when it closes out on them; paddle back round the outside.
 *
 * Positions move in model time (`dtModel`); poses and arms animate in real
 * time (`dtReal`), so a cover running the sea at 10x still has people-speed
 * limbs. Everything random comes from `seed`.
 */
import type { GridSpec, Vec2 } from '../bathy';
import { MAX_SURFER_SPEED, type Front } from './fronts';
import { drawRig, drawSitter, poseAt, POSES, BOTTOM, TOP, TRIM, TUBE, POPUP, type RigStyle } from './rig';
import { DEFAULT_THEME, type Theme } from './theme';

export type SurferState = 'lineup' | 'takeoff' | 'ride' | 'kickout' | 'wipeout' | 'paddle';

export interface Surfer {
	id: number;
	state: SurferState;
	x: number;
	y: number;
	anchor: Vec2;
	/** front being ridden */
	frontId: number;
	/** seconds in this state (real for kickout and wipeout; model otherwise) */
	t: number;
	cooldown: number;
	phase: number;
	vx: number;
	vy: number;
	/** lean (rad) and nose-down pitch (rad) while riding */
	roll: number;
	pitch: number;
	/** screen facing, +1 right */
	face: number;
	trail: number[];
	path: { a: Vec2; c: Vec2; b: Vec2; dur: number } | null;
	rides: number;
	wipeouts: number;
	/** model seconds spent more than 30 m behind the front */
	behind: number;
	/** last sighting of the ridden front, to bridge tracker gaps */
	last: { x: number; y: number; dir: [number, number]; waveDir: [number, number]; speed: number; makeable: boolean; lost: number } | null;
}

export interface SurferOptions {
	/** points on or near the coast to form lineups at (ENU m), e.g. a spot's named sections */
	zones: Vec2[];
	/** still-water depth (m) of the grid, for placing lineups (idx = ix * ny + iy) */
	depth: Float32Array;
	grid: GridSpec;
	/** how many surfers (6 to 12 recommended, default 8) */
	count?: number;
	seed?: number;
	/** depth the lineup sits in, just seaward of where the sim breaks (m, default 1.8) */
	lineupDepth?: number;
	/** how close (m) a front must come for a take-off (default 60) */
	takeoffRadius?: number;
}

/** model seconds from take-off to riding (the pop-up) */
const TAKEOFF_S = 1.2;

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

/** Bilinear depth at an ENU point (m); land is negative, outside the grid -Infinity. */
export function depthSampler(depth: Float32Array, grid: GridSpec) {
	const r = (grid.rotationDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
	return (x: number, y: number) => {
		const dx = x - grid.origin[0], dy = y - grid.origin[1];
		const gx = (dx * c + dy * s) / grid.dx, gy = (-dx * s + dy * c) / grid.dx;
		if (gx < 0 || gy < 0 || gx > grid.nx - 1 || gy > grid.ny - 1) return -Infinity;
		const i = Math.min(Math.floor(gx), grid.nx - 2), j = Math.min(Math.floor(gy), grid.ny - 2);
		const fx = gx - i, fy = gy - j;
		const D = (a: number, b: number) => depth[a * grid.ny + b];
		return (1 - fx) * ((1 - fy) * D(i, j) + fy * D(i, j + 1)) + fx * ((1 - fy) * D(i + 1, j) + fy * D(i + 1, j + 1));
	};
}

export interface RideRecord {
	surfer: number;
	/** model seconds on the wave */
	seconds: number;
	/** metres travelled */
	meters: number;
	end: 'kickout' | 'wipeout' | 'lost';
}

export interface SurferCrowd {
	readonly surfers: Surfer[];
	/** completed rides, oldest first (the last 200) */
	readonly log: RideRecord[];
	update(dtModel: number, dtReal: number, fronts: Front[]): void;
	/**
	 * Draw on a 2d context in CSS pixels. `toPx` maps ENU to CSS pixels;
	 * `pxPerMeter` sizes the figures (they stay legible when zoomed out).
	 */
	draw(ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number], pxPerMeter: number, theme?: Theme): void;
}

export function createSurfers(o: SurferOptions): SurferCrowd {
	const rand = rng(o.seed ?? 7);
	const count = o.count ?? 8;
	const depthAt = depthSampler(o.depth, o.grid);
	const lineupDepth = o.lineupDepth ?? 1.8;
	const reach = o.takeoffRadius ?? 60;

	// seaward unit vector at a point: up the depth gradient
	const seaward = (x: number, y: number): Vec2 => {
		const e = 4;
		const gx = depthAt(x + e, y) - depthAt(x - e, y), gy = depthAt(x, y + e) - depthAt(x, y - e);
		const n = Math.hypot(gx, gy);
		return n > 1e-6 && Number.isFinite(n) ? [gx / n, gy / n] : [1, 0];
	};
	// walk seaward from a point until the water is `d` deep
	const outTo = (p: Vec2, d: number): Vec2 => {
		let [x, y] = p;
		for (let k = 0; k < 400 && depthAt(x, y) < d; k++) {
			const s = seaward(x, y);
			x += s[0] * 2;
			y += s[1] * 2;
		}
		return [x, y];
	};
	const anchors = o.zones.map((z) => outTo(z, lineupDepth));

	const surfers: Surfer[] = [];
	for (let i = 0; i < count; i++) {
		const base = anchors[i % anchors.length];
		const s = seaward(...base);
		// spread along the lineup and a little seaward
		const along = (rand() - 0.5) * 70, out = rand() * 25;
		const a: Vec2 = [base[0] - s[1] * along + s[0] * out, base[1] + s[0] * along + s[1] * out];
		surfers.push({
			id: i, state: 'lineup', x: a[0], y: a[1], anchor: a, frontId: -1, t: 0,
			cooldown: rand() * 20, phase: rand() * 10, vx: 0, vy: 0, roll: 0, pitch: 0,
			face: rand() < 0.5 ? -1 : 1, trail: [], path: null, rides: 0, wipeouts: 0, last: null, behind: 0
		});
	}

	let clock = 0;
	const log: RideRecord[] = [];
	const rideStart = new Map<number, { x: number; y: number; meters: number }>();
	const endRide = (s: Surfer, end: RideRecord['end']) => {
		const r = rideStart.get(s.id);
		if (r) log.push({ surfer: s.id, seconds: s.t, meters: r.meters, end });
		if (log.length > 200) log.shift();
		rideStart.delete(s.id);
	};

	function startPaddle(s: Surfer) {
		const a: Vec2 = [s.x, s.y];
		const b = s.anchor;
		const sw = seaward(...a);
		const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
		// arc out round the break: control point seaward of the midpoint
		const c: Vec2 = [(a[0] + b[0]) / 2 + sw[0] * (25 + 0.3 * d), (a[1] + b[1]) / 2 + sw[1] * (25 + 0.3 * d)];
		s.path = { a, c, b, dur: (d * 1.3 + 50) / 1.6 }; // ~1.6 m/s paddling
		s.state = 'paddle';
		s.t = 0;
	}

	function update(dtModel: number, dtReal: number, fronts: Front[]) {
		clock += dtReal;
		const byId = new Map(fronts.map((f) => [f.id, f]));
		const taken = new Set(surfers.filter((s) => s.state === 'ride' || s.state === 'takeoff').map((s) => s.frontId));
		for (const s of surfers) {
			const ox = s.x, oy = s.y;
			s.cooldown = Math.max(0, s.cooldown - dtModel);
			if (s.state === 'lineup') {
				// sit and drift a little round the anchor
				s.x = s.anchor[0] + Math.sin(clock * 0.31 + s.phase) * 2.5;
				s.y = s.anchor[1] + Math.cos(clock * 0.23 + s.phase * 1.7) * 2.5;
				if (s.cooldown > 0) continue;
				let best: Front | null = null, bd = reach;
				for (const f of fronts) {
					if (!f.peeling || !f.makeable || f.speed > MAX_SURFER_SPEED || taken.has(f.id)) continue;
					const dx = s.x - f.x, dy = s.y - f.y;
					const d = Math.hypot(dx, dy);
					// the front must be coming toward the surfer (or be on them)
					if (d < bd && dx * f.dir[0] + dy * f.dir[1] > -8) {
						bd = d;
						best = f;
					}
				}
				if (best) {
					s.state = 'takeoff';
					s.frontId = best.id;
					s.last = null;
					s.behind = 0;
					s.t = 0;
					s.trail.length = 0;
					taken.add(best.id);
				}
			} else if (s.state === 'takeoff' || s.state === 'ride') {
				let f: Front | { x: number; y: number; dir: [number, number]; waveDir: [number, number]; speed: number; makeable: boolean } | undefined = byId.get(s.frontId);
				if (!f && s.last) {
					// the tracker may have re-identified the front: take the nearest
					// peel running the same way, else coast on the last sighting
					let bd = 30;
					for (const g of fronts) {
						if (!g.peeling || taken.has(g.id)) continue;
						const d = Math.hypot(g.x - s.last.x, g.y - s.last.y);
						if (d < bd && g.dir[0] * s.last.dir[0] + g.dir[1] * s.last.dir[1] > 0.5) {
							bd = d;
							f = g;
						}
					}
					if (f) {
						s.frontId = (f as Front).id;
						taken.add(s.frontId);
					} else if (s.last.lost < 1.5) {
						s.last.lost += dtModel;
						s.last.x += s.last.dir[0] * s.last.speed * dtModel;
						s.last.y += s.last.dir[1] * s.last.speed * dtModel;
						f = s.last;
					}
				}
				if (f && f !== s.last) s.last = { x: f.x, y: f.y, dir: f.dir, waveDir: f.waveDir, speed: f.speed, makeable: f.makeable, lost: 0 };
				s.t += dtModel;
				if (s.state === 'takeoff' && s.t > TAKEOFF_S) {
					s.state = 'ride';
					s.t = 0;
					s.rides++;
					rideStart.set(s.id, { x: s.x, y: s.y, meters: 0 });
				}
				if (!f) {
					// the front is gone: the wave has finished
					if (s.state === 'ride') endRide(s, 'lost');
					s.state = 'kickout';
					s.t = 0;
					continue;
				}
				// ride the shoulder: a little ahead of the front and seaward of it
				const lead = 10, off = 6;
				const tx = f.x + f.dir[0] * lead - f.waveDir[0] * off;
				const ty = f.y + f.dir[1] * lead - f.waveDir[1] * off;
				const dx = tx - s.x, dy = ty - s.y;
				const d = Math.hypot(dx, dy);
				// during the pop-up the wave itself carries the surfer onto the shoulder
				const vmax = (s.state === 'takeoff' ? f.speed + MAX_SURFER_SPEED : MAX_SURFER_SPEED) * dtModel;
				const step = Math.min(d, vmax);
				const nvx = d > 1e-6 ? (dx / d) * step / Math.max(dtModel, 1e-6) : 0;
				const nvy = d > 1e-6 ? (dy / d) * step / Math.max(dtModel, 1e-6) : 0;
				// lean from path curvature, pitch from along-track acceleration
				const sp = Math.hypot(nvx, nvy), sp0 = Math.hypot(s.vx, s.vy);
				if (dtModel > 0 && sp > 0.5 && sp0 > 0.5) {
					const turn = Math.atan2(s.vx * nvy - s.vy * nvx, s.vx * nvx + s.vy * nvy) / dtModel; // rad/s
					const k = 1 - Math.exp(-dtReal * 4);
					s.roll += k * (Math.atan((sp * turn) / 9.81) - s.roll);
					s.pitch += k * (Math.atan((sp - sp0) / dtModel / 9.81) - s.pitch);
				}
				s.vx = nvx;
				s.vy = nvy;
				s.x += nvx * dtModel;
				s.y += nvy * dtModel;
				const rs = rideStart.get(s.id);
				if (rs) rs.meters += Math.hypot(nvx, nvy) * dtModel;
				s.trail.push(s.x, s.y);
				if (s.trail.length > 80) s.trail.splice(0, 2);
				if (s.state === 'ride') {
					if (!f.makeable && d < 12) {
						endRide(s, 'wipeout'); // it closed out on them
						s.state = 'wipeout';
						s.wipeouts++;
						s.t = 0;
					} else if ((s.behind = d > 30 && s.t > 2 ? s.behind + dtModel : 0) > 1.5 || s.t > 40) {
						endRide(s, 'kickout'); // outrun, or a long one
						s.state = 'kickout';
						s.t = 0;
					}
				}
			} else if (s.state === 'kickout' || s.state === 'wipeout') {
				s.t += dtReal;
				const sw = seaward(s.x, s.y);
				const v = s.state === 'kickout' ? 3 : -1.5; // pull out over the back, or get washed in
				s.x += sw[0] * v * dtModel;
				s.y += sw[1] * v * dtModel;
				if (s.t > (s.state === 'kickout' ? 0.9 : 1.6)) startPaddle(s);
			} else if (s.state === 'paddle' && s.path) {
				s.t += dtModel;
				const u = Math.min(1, s.t / s.path.dur);
				const e = u * u * (3 - 2 * u);
				const { a, c, b } = s.path;
				const iu = 1 - e;
				s.x = iu * iu * a[0] + 2 * iu * e * c[0] + e * e * b[0];
				s.y = iu * iu * a[1] + 2 * iu * e * c[1] + e * e * b[1];
				if (s.trail.length) s.trail.splice(0, 2);
				if (u >= 1) {
					s.state = 'lineup';
					s.path = null;
					s.cooldown = 8 + rand() * 20;
				}
			}
			s.vx = s.state === 'ride' || s.state === 'takeoff' ? s.vx : (s.x - ox) / Math.max(dtModel, 1e-6);
			s.vy = s.state === 'ride' || s.state === 'takeoff' ? s.vy : (s.y - oy) / Math.max(dtModel, 1e-6);
		}
	}

	function draw(ctx: CanvasRenderingContext2D, toPx: (x: number, y: number) => [number, number], pxPerMeter: number, theme: Theme = DEFAULT_THEME) {
		// figures are drawn far larger than life so they read from the cover distance
		const S = Math.min(0.5, Math.max(0.2, 0.24 * Math.pow(pxPerMeter / 0.35, 0.3)));
		const lw = Math.max(0.9, S * 5);
		for (const s of surfers) {
			const [px, py] = toPx(s.x, s.y);
			// facing follows screen motion
			const [qx] = toPx(s.x + s.vx, s.y + s.vy);
			if (Math.abs(qx - px) > 0.02 && s.state !== 'lineup') s.face = qx > px ? 1 : -1;
			const riding = s.state === 'ride' || s.state === 'takeoff';
			if (s.trail.length > 4) {
				ctx.lineWidth = 1;
				for (let i = 2; i < s.trail.length; i += 2) {
					const [ax, ay] = toPx(s.trail[i - 2], s.trail[i - 1]);
					const [bx, by] = toPx(s.trail[i], s.trail[i + 1]);
					ctx.strokeStyle = rgba(theme.foam, (i / s.trail.length) * 0.4);
					ctx.beginPath();
					ctx.moveTo(ax, ay);
					ctx.lineTo(bx, by);
					ctx.stroke();
				}
			}
			if (riding) {
				ctx.fillStyle = rgba(theme.accent, 0.22);
				ctx.beginPath();
				ctx.arc(px, py, 9, 0, Math.PI * 2);
				ctx.fill();
			}
			const st: RigStyle = { board: riding ? '#ffb454' : theme.accent, body: theme.foam, lw };
			ctx.save();
			ctx.translate(px, py);
			ctx.scale(s.face, 1);
			if (s.state === 'lineup') {
				ctx.rotate(Math.sin(clock * 0.7 + s.phase) * 0.06);
				ctx.globalAlpha = 0.9;
				drawSitter(ctx, S, st);
			} else if (s.state === 'takeoff') {
				drawRig(ctx, poseAt(POPUP + Math.min(1, s.t / TAKEOFF_S)), S, st);
			} else if (s.state === 'ride') {
				// pose from the ride: leaning into a turn -> bottom turn, out of it
				// -> top turn, accelerating down the face -> tube crouch
				const lean = Math.max(-1, Math.min(1, s.roll / 0.5));
				let u = TRIM + Math.sin(clock * 1.3 + s.phase) * 0.3;
				if (lean > 0.15) u = TRIM + Math.min(1, lean);
				else if (lean < -0.15) u = BOTTOM + Math.min(1, -lean);
				if (s.pitch > 0.25) u = TOP + Math.min(1, (s.pitch - 0.25) * 3);
				ctx.rotate(-s.roll * 0.35);
				drawRig(ctx, poseAt(Math.min(u, TUBE)), S, st, null, (-s.pitch * 180) / Math.PI * 0.5);
			} else if (s.state === 'kickout') {
				drawRig(ctx, poseAt(TOP + 0.3), S, st, null, 20 * Math.min(1, s.t / 0.5));
			} else if (s.state === 'wipeout') {
				const k = Math.min(1, s.t / 0.8);
				ctx.globalAlpha = 1 - 0.6 * k;
				ctx.rotate(k * 2.2);
				drawRig(ctx, poseAt(POPUP), S, st, null, 60 * k);
			} else {
				ctx.globalAlpha = 0.8;
				drawRig(ctx, POSES[0], S, st, clock * 6 + s.phase);
			}
			ctx.restore();
		}
	}

	return { surfers, log, update, draw };
}

function rgba(hex: string, a: number) {
	let h = hex.replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const n = parseInt(h, 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

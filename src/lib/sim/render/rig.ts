/**
 * The P6 stick-figure surfer rig (from the research notes, as lifted by the
 * book's P6 instrument): six key poses, cosine blending, two-bone IK legs and
 * forward-kinematics arms. Drawn in a local frame: +x toward the nose, +y up,
 * in "surfer units" (torso 34, board 64), scaled by S to pixels.
 */

export type XY = { x: number; y: number };
export type Arm = { sh: number; el: number };
export type Pose = { hips: XY; torso: number; head: number; footF: XY; footB: XY; armF: Arm; armB: Arm; pitch: number; prone?: boolean };

/** paddle, pop-up, trim, bottom turn, top turn, tube */
export const POSES: Pose[] = [
	{ hips: { x: -14, y: 7 }, torso: 82, head: -42, footF: { x: -34, y: 5 }, footB: { x: -46, y: 5 }, armF: { sh: 120, el: 20 }, armB: { sh: 60, el: 40 }, pitch: 0, prone: true },
	{ hips: { x: -8, y: 26 }, torso: 38, head: -14, footF: { x: 14, y: 0 }, footB: { x: -22, y: 0 }, armF: { sh: 50, el: 80 }, armB: { sh: 40, el: 95 }, pitch: -2 },
	{ hips: { x: -4, y: 44 }, torso: 12, head: 0, footF: { x: 16, y: 0 }, footB: { x: -20, y: 0 }, armF: { sh: 70, el: 25 }, armB: { sh: -50, el: 30 }, pitch: -1 },
	{ hips: { x: -10, y: 30 }, torso: 34, head: -8, footF: { x: 16, y: 0 }, footB: { x: -20, y: 0 }, armF: { sh: 55, el: 10 }, armB: { sh: -55, el: 15 }, pitch: -8 },
	{ hips: { x: 0, y: 50 }, torso: -14, head: 6, footF: { x: 15, y: 0 }, footB: { x: -21, y: 0 }, armF: { sh: 150, el: 10 }, armB: { sh: -75, el: 30 }, pitch: 10 },
	{ hips: { x: -12, y: 24 }, torso: 26, head: -4, footF: { x: 17, y: 0 }, footB: { x: -19, y: 0 }, armF: { sh: 95, el: 5 }, armB: { sh: -10, el: 80 }, pitch: -3 }
];
export const PADDLE = 0, POPUP = 1, TRIM = 2, BOTTOM = 3, TOP = 4, TUBE = 5;

const SEG = { torso: 34, thigh: 26, shin: 24, armU: 18, armL: 16, head: 6.5, board: 64 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export function lerpPose(a: Pose, b: Pose, u: number): Pose {
	u = (1 - Math.cos(Math.PI * clamp(u, 0, 1))) / 2;
	return {
		hips: { x: lerp(a.hips.x, b.hips.x, u), y: lerp(a.hips.y, b.hips.y, u) },
		torso: lerp(a.torso, b.torso, u),
		head: lerp(a.head, b.head, u),
		pitch: lerp(a.pitch, b.pitch, u),
		footF: { x: lerp(a.footF.x, b.footF.x, u), y: lerp(a.footF.y, b.footF.y, u) },
		footB: { x: lerp(a.footB.x, b.footB.x, u), y: lerp(a.footB.y, b.footB.y, u) },
		armF: { sh: lerp(a.armF.sh, b.armF.sh, u), el: lerp(a.armF.el, b.armF.el, u) },
		armB: { sh: lerp(a.armB.sh, b.armB.sh, u), el: lerp(a.armB.el, b.armB.el, u) },
		prone: u < 0.5 ? a.prone : b.prone
	};
}

/** two-bone IK: the joint between root and target for lengths l1, l2, bend side */
export function ik(rx: number, ry: number, tx: number, ty: number, l1: number, l2: number, bend: number): [number, number] {
	const dx = tx - rx, dy = ty - ry;
	const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
	const a1 = Math.acos(clamp((d * d + l1 * l1 - l2 * l2) / (2 * d * l1), -1, 1));
	const ang = Math.atan2(dy, dx) + bend * a1;
	return [rx + l1 * Math.cos(ang), ry + l1 * Math.sin(ang)];
}

export interface RigStyle {
	board: string;
	body: string;
	/** stroke width (px) */
	lw: number;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function seg(ctx: Ctx, pts: [number, number][]) {
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
	ctx.stroke();
}

/**
 * Draw a pose at the current transform origin. `armPhase` (rad) windmills the
 * arms when prone. `extraPitch` (deg) tilts the board (the wave face).
 */
export function drawRig(ctx: Ctx, pose: Pose, S: number, st: RigStyle, armPhase: number | null = null, extraPitch = 0) {
	const px = (x: number, y: number): [number, number] => [x * S, -y * S];
	const bp = ((pose.pitch + extraPitch) * Math.PI) / 180;
	const bx = (Math.cos(bp) * SEG.board) / 2, by = (Math.sin(bp) * SEG.board) / 2;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = st.board;
	ctx.lineWidth = st.lw * 1.5;
	seg(ctx, [px(-bx, -by), px(bx, by)]);
	ctx.strokeStyle = st.body;
	ctx.lineWidth = st.lw;
	// the body stands on the pitched board: rotate the rig about the board centre
	const r = (extraPitch * Math.PI) / 180;
	const rot = (x: number, y: number): [number, number] => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
	const P = (x: number, y: number) => px(...rot(x, y));
	const hip: [number, number] = [pose.hips.x, pose.hips.y];
	const tA = ((90 - pose.torso) * Math.PI) / 180;
	const chest: [number, number] = [hip[0] + SEG.torso * Math.cos(tA), hip[1] + SEG.torso * Math.sin(tA)];
	const hA = ((90 - pose.torso - pose.head) * Math.PI) / 180;
	const headC: [number, number] = [chest[0] + (SEG.head + 4) * Math.cos(hA), chest[1] + (SEG.head + 4) * Math.sin(hA)];
	if (pose.prone) {
		seg(ctx, [P(...hip), P(pose.footB.x, pose.footB.y)]);
		seg(ctx, [P(...hip), P(pose.footF.x, pose.footF.y + 1.5)]);
	} else {
		for (const f of [pose.footF, pose.footB]) {
			const foot: [number, number] = [f.x, f.y + 2];
			const knee = ik(hip[0], hip[1], foot[0], foot[1], SEG.thigh, SEG.shin, 1);
			seg(ctx, [P(...hip), P(...knee), P(...foot)]);
		}
	}
	seg(ctx, [P(...hip), P(...chest)]);
	const ga = ctx.globalAlpha;
	for (const [arm, alpha, k] of [[pose.armF, 1, 0], [pose.armB, 0.75, 1]] as const) {
		let sh = arm.sh, el = arm.el;
		if (pose.prone && armPhase !== null) {
			const ph = armPhase + k * Math.PI;
			sh = 100 + Math.sin(ph) * 65;
			el = 30 + Math.cos(ph) * 25;
		}
		const aA = tA + Math.PI + (sh * Math.PI) / 180;
		const elb: [number, number] = [chest[0] + SEG.armU * Math.cos(aA), chest[1] + SEG.armU * Math.sin(aA)];
		const wA = aA + (el * Math.PI) / 180;
		const hand: [number, number] = [elb[0] + SEG.armL * Math.cos(wA), elb[1] + SEG.armL * Math.sin(wA)];
		ctx.globalAlpha = ga * alpha;
		seg(ctx, [P(...chest), P(...elb), P(...hand)]);
	}
	ctx.globalAlpha = ga;
	ctx.fillStyle = st.body;
	const hc = P(...headC);
	ctx.beginPath();
	ctx.arc(hc[0], hc[1], Math.max(1, SEG.head * S * 1.15), 0, Math.PI * 2);
	ctx.fill();
}

/** Sitting on the board in the lineup, legs dangling. */
export function drawSitter(ctx: Ctx, S: number, st: RigStyle) {
	const px = (x: number, y: number): [number, number] => [x * S, -y * S];
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = st.board;
	ctx.lineWidth = st.lw * 1.5;
	seg(ctx, [px(-15, -4), px(19, 0)]);
	ctx.strokeStyle = st.body;
	ctx.lineWidth = st.lw;
	seg(ctx, [px(-1, 5), px(6, -2), px(8, -9)]);
	seg(ctx, [px(-1, 5), px(-2, -3), px(-5, -9)]);
	seg(ctx, [px(-1, 5), px(2, 30)]);
	seg(ctx, [px(2, 26), px(8, 16), px(6, 8)]);
	seg(ctx, [px(2, 26), px(-3, 15)]);
	ctx.fillStyle = st.body;
	const hc = px(3.5, 36.5);
	ctx.beginPath();
	ctx.arc(hc[0], hc[1], Math.max(1, SEG.head * S * 1.15), 0, Math.PI * 2);
	ctx.fill();
}

/** Pose blend parameter u in [0, 5] -> pose (POSES index + fraction). */
export function poseAt(u: number): Pose {
	const i = clamp(Math.floor(u), 0, 4), f = clamp(u - i, 0, 1);
	return lerpPose(POSES[i], POSES[Math.min(i + 1, 5)], f);
}

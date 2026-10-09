// Shared wave maths for the instruments.
//
// The first block is lifted unchanged from the research notes
// (surf-sim/making-of-research.html, "shared" script block): linear
// dispersion by Newton iteration, phase and group speed, shoaling factor.
// The second block holds the review's own working chain (breaking chapter and
// reading-the-day chapter), used to derive instrument defaults from the swell.

export const G = 9.81;

export function clamp(v: number, a: number, b: number) {
	return v < a ? a : v > b ? b : v;
}

/* dispersion: solve k from omega^2 = g k tanh(k d) */
export function waveK(T: number, d: number) {
	const om = (2 * Math.PI) / T,
		om2 = om * om;
	let k = om2 / (G * Math.sqrt(Math.tanh((om2 * d) / G))); // Eckart seed
	for (let i = 0; i < 8; i++) {
		const th = Math.tanh(k * d);
		const f = G * k * th - om2;
		const df = G * th + G * k * d * (1 - th * th);
		k -= f / df;
	}
	return k;
}
export function phaseSpeed(T: number, d: number) {
	return (2 * Math.PI) / T / waveK(T, d);
}
export function groupSpeed(T: number, d: number) {
	const k = waveK(T, d),
		c = (2 * Math.PI) / T / k,
		kd = k * d;
	return (c / 2) * (1 + (2 * kd) / Math.sinh(2 * kd));
}
export function shoalK(T: number, d: number) {
	const cg0 = (G * T) / (4 * Math.PI); // deep-water group speed
	return Math.sqrt(cg0 / groupSpeed(T, d));
}

export function fmt(v: number, digits = 1) {
	return Number(v).toFixed(digits);
}

/* ---- the review's chain (day chapter, key equation 3; breaking chapter) ---- */

/** Breaker height from offshore significant height and peak period: H_b = H_o^(4/5) [(1/sqrt g)(g P / 4 pi)]^(2/5). */
export function breakerHeight(Ho: number, P: number) {
	return Math.pow(Ho, 0.8) * Math.pow(((1 / Math.sqrt(G)) * (G * P)) / (4 * Math.PI), 0.4);
}
/** Breaking depth h_b = 1.28 H_b (gamma_b = 0.78). */
export const breakDepth = (Hb: number) => 1.28 * Hb;
/** Celerity at the break point, c_b = sqrt(2.0 g H_b). */
export const breakCelerity = (Hb: number) => Math.sqrt(2.0 * G * Hb);
/** Deep-water wavelength L_0 = g T^2 / 2 pi. */
export const deepLength = (T: number) => (G * T * T) / (2 * Math.PI);
/** Iribarren number xi_0 = tan(slope) / sqrt(H_0 / L_0). */
export const iribarren = (tanSlope: number, H0: number, T: number) => tanSlope / Math.sqrt(H0 / deepLength(T));
export function breakerType(xi: number) {
	return xi < 0.5 ? 'spilling' : xi <= 3.3 ? 'plunging' : 'surging';
}

// Instrument colours and type come from CSS custom properties, so a host page
// restyles every canvas by setting tokens (see tokens.css). The fallbacks are
// the research-notes palette: ink navy, teal, coral.

const FALLBACK = {
	ink: '#071019',
	ink2: '#0a1a26',
	land: '#0f2430',
	coast: '#aad2d2',
	teal: '#7ac5c8',
	tealHi: '#b5e5e2',
	foam: '#f2efe6',
	accent: '#ff8a5c',
	gold: '#ffb454',
	muted: '#93aab0',
	good: '#8ed99a',
	mono: "'Spline Sans Mono', ui-monospace, monospace"
};

export type Palette = typeof FALLBACK & {
	/** Colour with alpha: `a(p.teal, 0.5)`. Accepts #rgb, #rrggbb. */
	a: (hex: string, alpha: number) => string;
	/** Canvas font string in the mono face: `font(10.5)`. */
	font: (px: number) => string;
	/** The faint grid colour (teal at 10 %). */
	grid: string;
};

const VAR: Record<keyof typeof FALLBACK, string> = {
	ink: '--ink',
	ink2: '--ink-2',
	land: '--land',
	coast: '--coast',
	teal: '--teal',
	tealHi: '--teal-hi',
	foam: '--foam',
	accent: '--coral',
	gold: '--gold',
	muted: '--muted',
	good: '--good',
	mono: '--mono'
};

function rgba(hex: string, alpha: number) {
	let h = hex.trim().replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const n = parseInt(h.slice(0, 6), 16);
	if (Number.isNaN(n)) return hex;
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Read the palette from the computed style of `el` (falls back per token). */
export function palette(el?: Element | null): Palette {
	const cs = el && typeof getComputedStyle !== 'undefined' ? getComputedStyle(el) : null;
	const p = { ...FALLBACK };
	if (cs) for (const k of Object.keys(VAR) as (keyof typeof FALLBACK)[]) p[k] = cs.getPropertyValue(VAR[k]).trim() || FALLBACK[k];
	return {
		...p,
		a: rgba,
		font: (px: number) => `${px}px ${p.mono}`,
		grid: rgba(p.teal, 0.1)
	};
}

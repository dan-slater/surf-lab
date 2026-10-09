/**
 * Renderer colours. The tokens and defaults match the book's instrument
 * palette (surf-lab-book src/lib/instruments/palette.ts) and the approved
 * wave-landing aesthetic: ink navy sea, teal crests, cream foam, coral boards.
 */
export interface Theme {
	/** deep water */
	ink: string;
	/** shallow water, before the teal tint of the surf zone */
	ink2: string;
	land: string;
	/** coastline stroke */
	coast: string;
	/** crest lines in deep water, depth contours */
	teal: string;
	/** crest lines as they shoal */
	tealHi: string;
	foam: string;
	/** boards, the riding surfer's glow */
	accent: string;
	/** wet sand at the waterline */
	sand: string;
}

export const DEFAULT_THEME: Theme = {
	ink: '#060e17',
	ink2: '#0b1c29',
	land: '#0f2430',
	coast: '#aad2d2',
	teal: '#7ac5c8',
	tealHi: '#b5e5e2',
	foam: '#f2efe6',
	accent: '#ff8a5c',
	sand: '#1d3a44'
};

export const THEME_KEYS = ['ink', 'ink2', 'land', 'coast', 'teal', 'tealHi', 'foam', 'accent', 'sand'] as const;

/** '#rrggbb' or '#rgb' to linear-ish [r, g, b] in 0..1 (sRGB values; the canvas is sRGB). */
export function hexToRgb(hex: string): [number, number, number] {
	let h = hex.trim().replace('#', '');
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const n = parseInt(h.slice(0, 6), 16);
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Theme as a flat float array, one vec4 per token in THEME_KEYS order. */
export function packTheme(t: Theme): Float32Array {
	const a = new Float32Array(THEME_KEYS.length * 4);
	THEME_KEYS.forEach((k, i) => a.set([...hexToRgb(t[k]), 1], i * 4));
	return a;
}

/**
 * Read a theme from CSS custom properties on an element (--ink, --ink-2,
 * --land, --coast, --teal, --teal-hi, --foam, --coral, --sand), falling back
 * per token. The same variables the book's instruments read.
 */
export function themeFromCss(el: Element, base: Theme = DEFAULT_THEME): Theme {
	const cs = getComputedStyle(el);
	const v = (name: string, d: string) => cs.getPropertyValue(name).trim() || d;
	return {
		ink: v('--ink', base.ink),
		ink2: v('--ink-2', base.ink2),
		land: v('--land', base.land),
		coast: v('--coast', base.coast),
		teal: v('--teal', base.teal),
		tealHi: v('--teal-hi', base.tealHi),
		foam: v('--foam', base.foam),
		accent: v('--coral', base.accent),
		sand: v('--sand', base.sand)
	};
}

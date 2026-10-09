// String-level rendering for chapter text: KaTeX for \( \) and \[ \] math,
// citation markers to reference links, #slug links to chapter routes. Runs at
// build time on the raw strings, before any HTML parse, because some math holds
// a bare `<` (e.g. \(u < c\)) that an HTML parser would eat.
import katex from 'katex';
import { CHAPTER_ORDER } from './order';

export const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function tex(src: string, displayMode: boolean): string {
	return katex.renderToString(src.trim(), { displayMode, throwOnError: false, strict: 'ignore' });
}

const MATH = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;

/**
 * Render \( \) and \[ \] math in a string. Text between the math is passed
 * through `between` (link rewriting for HTML fields, escaping for plain text).
 */
export function renderMath(s: string, between: (t: string) => string): string {
	let out = '';
	let last = 0;
	for (const m of s.matchAll(MATH)) {
		out += between(s.slice(last, m.index));
		out += m[1] !== undefined ? tex(m[1], true) : tex(m[2], false);
		last = m.index + m[0].length;
	}
	return out + between(s.slice(last));
}

const SLUGS = new Set<string>(CHAPTER_ORDER);

/** Citation markers [n] become links to the reference list; #slug links become chapter routes. */
export function linkHtml(html: string): string {
	return html
		.replace(/\[(\d+)\]/g, '<a class="cite" href="#ref-$1">[$1]</a>')
		.replace(/href="#([a-z]+)"/g, (whole, slug: string) => (SLUGS.has(slug) ? `href="/book/${slug}"` : whole));
}

/** Body HTML: math rendered, links rewritten. */
export const bodyHtml = (s: string) => renderMath(s, linkHtml);
/** Plain text with math: escaped, math rendered. */
export const plain = (s: string | undefined) => renderMath(s ?? '', escapeHtml);
/** Plain text with math and citation markers. */
export const text = (s: string | undefined) => renderMath(s ?? '', (t) => linkHtml(escapeHtml(t)));

/** A key equation's latex may arrive bare or wrapped in \[ \]. */
export function displayLatex(src: string): string {
	const m = src.trim().match(/^\\\[([\s\S]*)\\\]$/);
	return tex(m ? m[1] : src, true);
}

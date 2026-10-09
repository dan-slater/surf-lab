import { describe, expect, test } from 'bun:test';
import { bodyHtml, displayLatex, plain, text } from './math';

describe('chapter text rendering', () => {
	test('inline math holding a bare < renders and does not leak a tag', () => {
		const html = bodyHtml('<p>so long as \\(u < c\\) the crest holds</p>');
		expect(html).toContain('class="katex"');
		expect(html).not.toContain('\\(');
		expect(html).not.toMatch(/<\s*c\b/); // no raw "< c" left for the HTML parser
		expect(html.startsWith('<p>so long as ')).toBe(true);
	});
	test('display math', () => {
		const html = bodyHtml('<p>a</p>\\[\\omega^2 = gk\\tanh(kh)\\]<p>b</p>');
		expect(html).toContain('katex-display');
	});
	test('citations link to the reference list; chapter anchors become routes', () => {
		const html = bodyHtml('<p>see <a href="#breaking">the breaking chapter</a> [3][4], and <a href="#nope">x</a></p>');
		expect(html).toContain('<a class="cite" href="#ref-3">[3]</a><a class="cite" href="#ref-4">[4]</a>');
		expect(html).toContain('href="/book/breaking"');
		expect(html).toContain('href="#nope"');
	});
	test('plain fields are escaped around their math', () => {
		expect(plain('a < b & \\(x\\)')).toStartWith('a &lt; b &amp; ');
		expect(text('note [2]')).toContain('href="#ref-2"');
	});
	test('key-equation latex with or without \\[ \\] wrappers', () => {
		const a = displayLatex('\\[ H = H_0 K_R K_S \\]');
		const b = displayLatex('H = H_0 K_R K_S');
		expect(a).toBe(b);
		expect(a).not.toContain('katex-error');
	});
});

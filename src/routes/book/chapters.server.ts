// Build-time chapter loader. Reads content/chapters/*.json (copied from the
// Surf Physics Review by scripts/sync-content.mjs) and renders the LaTeX to
// KaTeX HTML on the server (math.ts), so prerendered pages ship finished maths
// and no KaTeX JavaScript.
import { bodyHtml, displayLatex, escapeHtml, plain, text } from './math';
import { CHAPTER_ORDER, type ChapterSlug } from './order';

interface RawSection {
	heading: string;
	body_html: string;
	on_the_wave?: string;
	diagram_spec?: string;
}
interface RawChapter {
	title: string;
	lede: string;
	sections: RawSection[];
	key_equations?: { latex: string; meaning?: string; worked_example?: string }[];
	citations?: { n: number; citation: string; url?: string; why_read_it?: string }[];
	changes?: string[] | null;
}

export interface Section {
	id: string;
	heading: string;
	html: string;
	onTheWave: string;
	diagramSpec: string;
}
export interface Chapter {
	slug: ChapterSlug;
	number: number;
	title: string;
	lede: string;
	sections: Section[];
	keyEquations: { html: string; meaning: string; workedExample: string }[];
	citations: { n: number; html: string; url: string; whyReadIt: string }[];
	changes: string[];
}

const files = import.meta.glob<RawChapter>('/content/chapters/*.json', { eager: true, import: 'default' });

function raw(slug: ChapterSlug): RawChapter {
	const c = files[`/content/chapters/${slug}.json`];
	if (!c) throw new Error(`content/chapters/${slug}.json missing: run scripts/sync-content.mjs`);
	return c;
}

export const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

const cache = new Map<ChapterSlug, Chapter>();

export function loadChapter(slug: ChapterSlug): Chapter {
	const hit = cache.get(slug);
	if (hit) return hit;
	const c = raw(slug);
	const chapter: Chapter = {
		slug,
		number: CHAPTER_ORDER.indexOf(slug) + 1,
		title: c.title,
		lede: plain(c.lede),
		sections: c.sections.map((s) => ({
			id: slugify(s.heading),
			heading: s.heading,
			html: bodyHtml(s.body_html),
			onTheWave: text(s.on_the_wave),
			diagramSpec: plain(s.diagram_spec)
		})),
		keyEquations: (c.key_equations ?? []).map((k) => ({
			html: displayLatex(k.latex),
			meaning: plain(k.meaning),
			workedExample: plain(k.worked_example)
		})),
		citations: (c.citations ?? []).map((r) => ({
			n: r.n,
			html: escapeHtml(r.citation),
			url: r.url ?? '',
			whyReadIt: plain(r.why_read_it)
		})),
		changes: (c.changes ?? []).map(plain)
	};
	cache.set(slug, chapter);
	return chapter;
}

export function chapterList() {
	return CHAPTER_ORDER.map((slug) => {
		const c = raw(slug);
		return { slug, number: CHAPTER_ORDER.indexOf(slug) + 1, title: c.title, lede: plain(c.lede), sections: c.sections.length };
	});
}

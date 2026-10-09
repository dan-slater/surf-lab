import { error } from '@sveltejs/kit';
import { loadChapter } from '../chapters.server';
import { CHAPTER_ORDER, isChapterSlug } from '../order';

export const prerender = true;

export function entries() {
	return CHAPTER_ORDER.map((chapter) => ({ chapter }));
}

export function load({ params }) {
	if (!isChapterSlug(params.chapter)) error(404, 'No such chapter');
	const i = CHAPTER_ORDER.indexOf(params.chapter);
	const neighbour = (j: number) => {
		const slug = CHAPTER_ORDER[j];
		return slug ? { slug, title: loadChapter(slug).title } : null;
	};
	return { chapter: loadChapter(params.chapter), prev: neighbour(i - 1), next: neighbour(i + 1) };
}

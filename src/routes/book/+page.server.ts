import { chapterList } from './chapters.server';

export const prerender = true;

export function load() {
	return { chapters: chapterList() };
}

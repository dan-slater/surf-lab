/** Reading order of the Surf Physics Review. Slugs are the chapter file names. */
export const CHAPTER_ORDER = [
	'swell',
	'breaking',
	'catching',
	'day',
	'riding',
	'turns',
	'board',
	'fins',
	'teaching'
] as const;

export type ChapterSlug = (typeof CHAPTER_ORDER)[number];

export const isChapterSlug = (s: string): s is ChapterSlug => (CHAPTER_ORDER as readonly string[]).includes(s);

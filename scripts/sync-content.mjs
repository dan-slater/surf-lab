#!/usr/bin/env bun
// Copy the Surf Physics Review chapters into content/chapters/ (git-ignored).
// The book repo is the only text source; this never edits it.
//
//   SURF_BOOK_DIR=/path/to/surf-physics-book/chapters bun scripts/sync-content.mjs
//
// Default source: ~/surf-physics-book/chapters. Fails loudly if it is missing
// or if any expected chapter is absent or not valid JSON.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHAPTERS = ['swell', 'breaking', 'catching', 'day', 'riding', 'turns', 'board', 'fins', 'teaching'];

/** @param {string} p */
const expand = (p) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
const src = resolve(expand(process.env.SURF_BOOK_DIR ?? '~/surf-physics-book/chapters'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dst = join(root, 'content', 'chapters');

/** @param {string} msg @returns {never} */
function fail(msg) {
	console.error(`sync-content: ${msg}`);
	console.error('Set SURF_BOOK_DIR to the surf-physics-book chapters directory.');
	process.exit(1);
}

if (!existsSync(src)) fail(`chapter source not found: ${src}`);
const present = new Set(readdirSync(src).filter((f) => f.endsWith('.json')));
const missing = CHAPTERS.filter((c) => !present.has(`${c}.json`));
if (missing.length) fail(`missing chapters in ${src}: ${missing.join(', ')}`);

mkdirSync(dst, { recursive: true });
for (const c of CHAPTERS) {
	const from = join(src, `${c}.json`);
	let data;
	try {
		data = JSON.parse(readFileSync(from, 'utf8'));
	} catch (e) {
		fail(`${from} is not valid JSON: ${e instanceof Error ? e.message : e}`);
	}
	if (typeof data.title !== 'string' || !Array.isArray(data.sections)) {
		fail(`${from} lacks a title or sections array`);
	}
	copyFileSync(from, join(dst, `${c}.json`));
}
console.log(`sync-content: ${CHAPTERS.length} chapters from ${src}`);

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { spots, defaultSpot, inWindow, compassName, spotBySlug } from './spots';
import { buildScene, offshoreBearing } from './scene';
import { openSea } from './frame';
import { jbayGrid, JBAY_COAST } from './jbay';
import type { CoastFile } from './coasts';

const angle = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
const coastFile = (slug: string): CoastFile | null => {
	const p = `${import.meta.dir}/coasts/${slug}.json`;
	return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
};

describe('catalogue', () => {
	test('about twenty spots, unique slugs, J-Bay first with its eight sections', () => {
		expect(spots.length).toBe(20);
		expect(new Set(spots.map((s) => s.slug)).size).toBe(spots.length);
		expect(defaultSpot.slug).toBe('jeffreys-bay');
		expect(defaultSpot.sections?.map((s) => s.name)).toEqual([
			'Kitchen Windows', 'Magnatubes', 'Boneyards', 'Supertubes', 'Impossibles', 'Tubes', 'The Point', 'Albatross'
		]);
	});
	test('positions and windows are sane', () => {
		for (const s of spots) {
			expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
			expect(Math.abs(s.lon)).toBeLessThanOrEqual(180);
			expect(inWindow(s.defaultSwell.dirDeg, s.swellWindow)).toBe(true);
		}
	});
	test('window wraps through north', () => {
		const w = spotBySlug('pipeline')!.swellWindow; // 280 to 20
		expect(inWindow(350, w)).toBe(true);
		expect(inWindow(10, w)).toBe(true);
		expect(inWindow(90, w)).toBe(false);
		expect(compassName(337)).toBe('NNW');
	});
});

describe('scenes', () => {
	test('J-Bay reproduces the reference grid exactly', () => {
		for (const dx of [6.25, 12.5]) {
			const sc = buildScene(defaultSpot, JBAY_COAST, dx);
			const ref = jbayGrid(dx);
			expect(sc.grid.nx).toBe(ref.nx);
			expect(sc.grid.ny).toBe(ref.ny);
			expect(sc.grid.rotationDeg).toBe(0);
			expect(sc.grid.origin[0]).toBeCloseTo(ref.origin[0], 9);
			expect(sc.grid.origin[1]).toBeCloseTo(ref.origin[1], 9);
			expect(sc.maxObliquityDeg).toBe(30);
		}
	});
	test('every bundled coast gives a grid whose wavemaker faces the open sea', () => {
		let n = 0;
		for (const s of spots) {
			const c = coastFile(s.slug);
			if (!c) continue;
			n++;
			const sc = buildScene(s, c, 12.5);
			const open = openSea(c.polylines, c.oceanSide);
			expect({ slug: s.slug, off: angle(offshoreBearing(sc.grid), open.bearingDeg) <= 60 }).toEqual({ slug: s.slug, off: true });
		}
		expect(n).toBeGreaterThanOrEqual(15);
	});
	test('spots without a usable coast say why', () => {
		for (const s of spots) {
			if (s.coastSource !== 'jbay' && !coastFile(s.slug)) expect(s.modelNote).toBeTruthy();
		}
	});
});

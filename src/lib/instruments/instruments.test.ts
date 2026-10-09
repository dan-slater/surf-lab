import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import {
	G,
	waveK,
	phaseSpeed,
	groupSpeed,
	shoalK,
	breakerHeight,
	breakDepth,
	breakCelerity,
	deepLength,
	iribarren,
	breakerType
} from './physics';
import { INSTRUMENT_IDS, instrumentFor, instrumentsInChapter, CHAPTER_SWELL } from './map';

// The derived instruments must reproduce the chapters' own worked examples.
describe('physics against the review', () => {
	test('dispersion limits', () => {
		const T = 14;
		expect((2 * Math.PI) / waveK(T, 1000)).toBeCloseTo(deepLength(T), 3); // deep: L0 = gT^2/2pi
		expect(phaseSpeed(T, 0.5) / Math.sqrt(G * 0.5)).toBeCloseTo(1, 2); // shallow: c -> sqrt(gh)
		expect(groupSpeed(T, 1000) / phaseSpeed(T, 1000)).toBeCloseTo(0.5, 4);
		expect(shoalK(T, 1000)).toBeCloseTo(1, 4);
	});
	test('swell chapter: 14 s swell, L0 306 m, wave base 153 m', () => {
		expect(deepLength(14)).toBeCloseTo(306, 0);
		expect(deepLength(14) / 2).toBeCloseTo(153, 0);
	});
	test('day chapter: H_o 1.5 m at 14 s gives H_b 2.28 m, h_b 2.9 m, c_b 6.7 m/s', () => {
		const Hb = breakerHeight(1.5, 14);
		expect(Hb).toBeCloseTo(2.28, 2);
		expect(breakDepth(Hb)).toBeCloseTo(2.92, 1);
		expect(breakCelerity(Hb)).toBeCloseTo(6.7, 1);
	});
	test('breaking chapter: c_b for 1.5 m and 2 m faces', () => {
		expect(breakCelerity(1.5)).toBeCloseTo(5.4, 1);
		expect(breakCelerity(2)).toBeCloseTo(6.3, 1);
	});
	test('breaking chapter: Iribarren on 1:30 and 1:10 for 2 m at 14 s', () => {
		const a = iribarren(0.033, 2, 14);
		const b = iribarren(0.1, 2, 14);
		expect(a).toBeCloseTo(0.41, 1);
		expect(breakerType(a)).toBe('spilling');
		expect(b).toBeCloseTo(1.24, 1);
		expect(breakerType(b)).toBe('plunging');
	});
	test('riding chapter: peel demand c/sin(alpha)', () => {
		const cb = 5.4;
		expect(cb / Math.sin(Math.PI / 4)).toBeCloseTo(7.6, 1);
		expect(cb / Math.sin(Math.PI / 6)).toBeCloseTo(10.8, 1);
	});
	test('turns chapter: R = v^2 / (g tan theta)', () => {
		expect((8 * 8) / (G * Math.tan(Math.PI / 4))).toBeCloseTo(6.5, 1);
		expect((8 * 8) / (G * Math.tan(Math.PI / 3))).toBeCloseTo(3.8, 1);
	});
});

describe('section map', () => {
	const order = ['swell', 'breaking', 'catching', 'day', 'riding', 'turns', 'board', 'fins', 'teaching'];
	const dir = 'content/chapters';
	const have = existsSync(`${dir}/swell.json`);

	test.skipIf(!have)('one entry list per section, for every chapter', () => {
		for (const slug of order) {
			const sections = JSON.parse(readFileSync(`${dir}/${slug}.json`, 'utf8')).sections as unknown[];
			for (let i = 0; i < sections.length; i++) expect(Array.isArray(instrumentFor(slug, i))).toBe(true);
			expect(instrumentFor(slug, sections.length)).toEqual([]);
			if (slug !== 'teaching') expect(instrumentFor(slug, 0).length).toBeGreaterThan(0);
		}
	});
	test('teaching is text only', () => {
		expect(instrumentsInChapter('teaching')).toEqual([]);
	});
	test('every instrument is used, every entry has a caption', () => {
		const used = new Set(order.flatMap((s) => instrumentsInChapter(s).map((e) => e.id)));
		for (const id of INSTRUMENT_IDS) expect(used.has(id)).toBe(true);
		for (const s of order) for (const e of instrumentsInChapter(s)) expect(e.caption.length).toBeGreaterThan(10);
	});
	test('chapter swells are complete', () => {
		for (const s of Object.values(CHAPTER_SWELL)) expect(Object.keys(s).sort()).toEqual(['Hs', 'Tp', 'dirDeg']);
	});
});

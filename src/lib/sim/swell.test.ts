import { describe, expect, test } from 'bun:test';
import { G, generatorDirection, phaseSpeed } from './swell';

describe('generatorDirection', () => {
	test('phase speed: deep and shallow limits', () => {
		expect(phaseSpeed(10, 2000)).toBeCloseTo((G * 10) / (2 * Math.PI), 6);
		expect(phaseSpeed(60, 2) / Math.sqrt(G * 2)).toBeCloseTo(1, 2);
	});

	test('J-Bay: deep-water 225 deg (SW, from behind the coast) lands near Run A\'s 120 deg', () => {
		const r = generatorDirection(225, { rotationDeg: 0 }, 26.4, { Tp: 15 });
		expect(r.fromBehind).toBe(true);
		expect(r.shoreNormalDeg).toBe(90);
		expect(Math.abs(r.dirDeg - 120)).toBeLessThan(10); // 129.3
		expect(r.dirDeg).toBeCloseTo(129.3, 0);
	});

	test('shore-normal swell is unchanged; oblique swell turns toward the normal', () => {
		expect(generatorDirection(90, { rotationDeg: 0 }, 20, { Tp: 12 }).dirDeg).toBeCloseTo(90, 9);
		const r = generatorDirection(60, { rotationDeg: 0 }, 20, { Tp: 12 });
		expect(r.localAngleDeg).toBeLessThan(0);
		expect(r.localAngleDeg).toBeGreaterThan(-30);
		// symmetric about the normal
		expect(generatorDirection(120, { rotationDeg: 0 }, 20, { Tp: 12 }).localAngleDeg).toBeCloseTo(-r.localAngleDeg, 9);
	});

	test('follows the grid rotation and caps at the generator sector', () => {
		// grid rotated 90 deg: offshore is north, a shore-normal swell comes from 0 deg
		const r = generatorDirection(350, { rotationDeg: 90 }, 25, { Tp: 10 });
		expect(r.shoreNormalDeg).toBe(0);
		expect(r.dirDeg).toBeGreaterThan(350);
		const capped = generatorDirection(60, { rotationDeg: 90 }, 40, { Tp: 6, maxObliquityDeg: 30 });
		expect(capped.clamped).toBe(true);
		expect(capped.dirDeg).toBeCloseTo(30, 9);
	});
});

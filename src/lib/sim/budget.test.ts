import { describe, expect, test } from 'bun:test';
import { Governor } from './budget';

/** run the governor against a fake GPU costing `stepMs` a step and `otherMs` a frame */
function run(budget: number, stepMs: number, otherMs: number, speed: number, seconds: number, dt = 0.126) {
	const levels: string[] = [];
	const g = new Governor(budget, dt, { onLevel: (l) => levels.push(l) });
	let model = 0;
	for (let f = 0; f < seconds * 60; f++) {
		const n = g.plan(speed / 60);
		model += n * dt;
		g.observe(n * stepMs, n, n * stepMs + otherMs, 1 / 60);
	}
	return { g, model, levels, maxSteps: g.maxSteps };
}

describe('Governor', () => {
	test('a fast GPU keeps the requested speed', () => {
		const r = run(16.7, 0.1, 2, 10, 10);
		expect(r.g.level).toBe('ok');
		expect(r.model).toBeGreaterThan(0.97 * 100);
		expect(r.g.msPerStep).toBeCloseTo(0.1, 2);
	});

	test('a slow GPU drops steps first: slow motion, not a downgrade', () => {
		// 2 ms a step: 5 steps fit; 60x speed wants 7.9 steps a frame at dt 0.126
		const r = run(16.7, 2, 3, 60, 10);
		expect(r.g.level).toBe('slow-motion');
		expect(r.maxSteps).toBe(5);
		expect(r.model / 600).toBeGreaterThan(0.55);
		expect(r.model / 600).toBeLessThan(0.7);
	});

	test('a GPU that cannot fit one step and a render asks for a coarser grid', () => {
		const r = run(16.7, 9, 12, 10, 10);
		expect(r.g.level).toBe('coarser-grid');
		expect(r.levels).toContain('coarser-grid');
	});

	test('late frames shrink the step cap even when the timings look cheap', () => {
		const g = new Governor(16.7, 0.126);
		let model = 0;
		for (let f = 0; f < 600; f++) {
			const n = g.plan(30 / 60);
			model += n * 0.126;
			// timings claim 0.1 ms a step, but frames take 25 ms when more than 2 steps run
			g.observe(0.1 * n, n, 1 + 0.1 * n, n > 2 ? 0.025 : 1 / 60);
		}
		expect(g.maxSteps).toBeLessThanOrEqual(3);
		expect(g.level).toBe('slow-motion');
	});
});

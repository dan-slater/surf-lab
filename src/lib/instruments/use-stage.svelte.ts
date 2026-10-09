import { untrack } from 'svelte';
import { createStage, loop, type Stage, type StageSize } from './stage';

/**
 * Bind a Stage to a canvas for the life of the component. `draw` runs once the
 * stage exists, again whenever any reactive state it reads changes, and on
 * every resize. Call during component initialisation.
 */
export function useStage(
	getCanvas: () => HTMLCanvasElement | undefined,
	size: StageSize,
	draw: (s: Stage) => void
) {
	let stage = $state.raw<Stage>();
	$effect(() => {
		const cv = getCanvas();
		if (!cv) return;
		const s = untrack(() =>
			createStage(cv, size, () => {
				if (stage) untrack(() => draw(stage!));
			})
		);
		stage = s;
		return () => {
			s.destroy();
			stage = undefined;
		};
	});
	$effect(() => {
		if (stage) draw(stage);
	});
	return {
		get stage() {
			return stage;
		}
	};
}

/**
 * Run `frame(stage, now)` every animation frame while the component is
 * mounted. Frames are skipped while the canvas is off screen unless
 * `always` is set. Reactive reads inside `frame` are not tracked.
 */
export function useLoop(
	getStage: () => Stage | undefined,
	frame: (s: Stage, now: number) => void,
	always = false
) {
	$effect(() => {
		const s = getStage();
		if (!s) return;
		return loop((now) => {
			if (always || s.visible) untrack(() => frame(s, now));
		});
	});
}

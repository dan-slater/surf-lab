// A canvas with a fixed logical size (the W x H the drawing code was written
// for) shown at any CSS width. The backing store follows the CSS size times
// devicePixelRatio and the context is scaled so the drawing code keeps
// working in logical units. Redraws on resize and on DPR change.

import { palette, type Palette } from './palette';

export interface Stage {
	ctx: CanvasRenderingContext2D;
	W: number;
	H: number;
	/** Current palette, re-read from CSS tokens on every resize. */
	col: Palette;
	/** True while the canvas is on screen; animation loops can skip work when false. */
	readonly visible: boolean;
	destroy(): void;
}

export function createStage(canvas: HTMLCanvasElement, W: number, H: number, redraw: () => void): Stage {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2-D canvas unavailable');
	let visible = true;
	const stage: Stage = {
		ctx,
		W,
		H,
		col: palette(canvas),
		get visible() {
			return visible;
		},
		destroy
	};

	function fit() {
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const cssW = canvas.clientWidth || W;
		const bw = Math.max(1, Math.round(cssW * dpr));
		const bh = Math.max(1, Math.round(((cssW * H) / W) * dpr));
		if (canvas.width !== bw || canvas.height !== bh) {
			canvas.width = bw;
			canvas.height = bh;
		}
		const k = bw / W;
		ctx!.setTransform(k, 0, 0, k, 0, 0);
		stage.col = palette(canvas);
		redraw();
	}

	const ro = new ResizeObserver(() => fit());
	ro.observe(canvas);
	const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true));
	io.observe(canvas);
	let mq: MediaQueryList | null = null;
	const onDpr = () => {
		fit();
		watchDpr();
	};
	function watchDpr() {
		mq?.removeEventListener('change', onDpr);
		mq = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		mq.addEventListener('change', onDpr, { once: true });
	}
	watchDpr();
	fit();

	function destroy() {
		ro.disconnect();
		io.disconnect();
		mq?.removeEventListener('change', onDpr);
	}
	return stage;
}

/** requestAnimationFrame loop that stops on dispose. `frame(now)` is called every frame. */
export function loop(frame: (now: number) => void): () => void {
	let raf = requestAnimationFrame(function tick(now) {
		frame(now);
		raf = requestAnimationFrame(tick);
	});
	return () => cancelAnimationFrame(raf);
}

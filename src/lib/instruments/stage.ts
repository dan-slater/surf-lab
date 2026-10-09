// A canvas with a logical size (the W x H the drawing code works in) shown at
// any CSS width. Wide (600 CSS px and up) the logical size is the instrument's
// design size, scaled to fit. Narrow, the logical width IS the CSS width and
// the height comes from the instrument's narrow layout, so labels keep their
// real pixel size and the drawing reflows instead of shrinking. The backing
// store follows the CSS size times devicePixelRatio. Redraws on resize and on
// DPR change.

import { palette, type Palette } from './palette';

/** CSS width below which instruments use their narrow layout. */
export const NARROW = 600;

/** Design size [W, H], plus the logical height for a narrow width. */
export interface StageSize {
	W: number;
	H: number;
	narrowH: (w: number) => number;
}

export interface Stage {
	ctx: CanvasRenderingContext2D;
	/** logical size of the current layout */
	W: number;
	H: number;
	/** true when the narrow layout is in use (W is the CSS width) */
	narrow: boolean;
	/** Current palette, re-read from CSS tokens on every resize. */
	col: Palette;
	/** True while the canvas is on screen; animation loops can skip work when false. */
	readonly visible: boolean;
	destroy(): void;
}

export function createStage(canvas: HTMLCanvasElement, size: StageSize, redraw: () => void): Stage {
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2-D canvas unavailable');
	let visible = true;
	const stage: Stage = {
		ctx,
		W: size.W,
		H: size.H,
		narrow: false,
		col: palette(canvas),
		get visible() {
			return visible;
		},
		destroy
	};

	function fit() {
		const dpr = Math.min(window.devicePixelRatio || 1, 3);
		const cssW = canvas.clientWidth || size.W;
		const narrow = cssW < NARROW;
		const W = narrow ? Math.max(1, Math.round(cssW)) : size.W;
		const H = narrow ? Math.round(size.narrowH(W)) : size.H;
		stage.W = W;
		stage.H = H;
		stage.narrow = narrow;
		canvas.style.aspectRatio = `${W} / ${H}`;
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

<!--
	Section speed (riding chapter, sections 2 and 5; breaking chapter, section 5).
	From the chapter: V_p = c_b / sin(alpha) is the speed a section demands, and
	the drag-free ceiling is c_b + sqrt(2 g H_b); Scarfe's manoeuvre bands and
	the floor and crumble limits come from the same text. Bottom strip: J-Bay's
	named sections, each with its own peel angle you set, since the review does
	not give per-section angles.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt, breakerHeight, breakCelerity } from './physics';
	import { axes, curve, dot, hline, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';
	import { JBAY } from '#lib/spots/jbay.ts';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, spot = JBAY, face, peel = 40 }: SwellProps & { face?: number; peel?: number } = $props();
	let Hb = $state(1.5);
	let alpha = $state(40);
	$effect.pre(() => { Hb = clamp(Math.round((face ?? breakerHeight(Hs, Tp)) * 10) / 10, 0.5, 5); });
	$effect.pre(() => { alpha = clamp(peel, 10, 85); });
	let selected = $state(3);
	let sectionAlpha = $state<number[]>([]);
	$effect.pre(() => {
		// start every section at the reader's angle; the strip is a sketchpad, not data
		sectionAlpha = spot.sections.map(() => 45);
	});

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 400, draw);

	function draw({ ctx, W, H, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const cb = breakCelerity(Hb);
		const ceil = cb + Math.sqrt(2 * G * Hb);
		const vMax = Math.max(25, ceil * 1.25);
		const A = axes(ctx, COL, { x: 60, y: 20, w: W - 100, h: 230 }, [10, 90], [0, vMax], {
			xTicks: [10, 20, 30, 40, 50, 60, 70, 80, 90],
			yTicks: Array.from({ length: Math.floor(vMax / 5) + 1 }, (_, i) => i * 5),
			xLabel: 'peel angle α [deg]',
			yLabel: 'speed [m/s]',
			xFmt: (v) => `${v}°`
		});
		// bands from the text
		const band = (lo: number, hi: number, name: string, color: string) => {
			ctx.fillStyle = color;
			ctx.fillRect(A.X(lo), A.box.y, A.X(hi) - A.X(lo), A.box.h);
			label(ctx, COL, name, (A.X(lo) + A.X(hi)) / 2, A.box.y + 12, COL.muted, 'center', 9);
		};
		band(35, 45, 'speed', COL.a(COL.teal, 0.08));
		band(48, 56, 're-entry', COL.a(COL.gold, 0.08));
		band(55, 62, 'cutback', COL.a(COL.accent, 0.07));
		band(70, 90, 'crumbles', COL.a(COL.foam, 0.04));
		curve(ctx, A, (a) => cb / Math.sin((a * Math.PI) / 180), COL.teal, 2.2, [], [10, 90]);
		hline(ctx, A, ceil, COL.accent, [6, 5]);
		label(ctx, COL, `ceiling c_b + √(2gH_b) = ${fmt(ceil, 1)} m/s`, A.X(89), A.Y(ceil) - 6, COL.accent, 'right');
		hline(ctx, A, cb, COL.a(COL.tealHi, 0.4));
		label(ctx, COL, `wave c_b = ${fmt(cb, 1)}`, A.X(89), A.Y(cb) - 6, COL.muted, 'right');
		const vp = cb / Math.sin((alpha * Math.PI) / 180);
		dot(ctx, A.X(alpha), A.Y(Math.min(vp, vMax)), 5, vp <= ceil ? COL.good : COL.accent);

		// section strip
		const y0 = 312, x0 = 60, x1 = W - 40;
		label(ctx, COL, `${spot.name.toUpperCase()}: CLICK A SECTION, SET ITS PEEL ANGLE`, x0, y0 - 20, COL.muted);
		const n = spot.sections.length;
		spot.sections.forEach((s, i) => {
			const x = x0 + ((i + 0.5) / n) * (x1 - x0);
			const a = sectionAlpha[i] ?? 45;
			const v = cb / Math.sin((a * Math.PI) / 180);
			const ok = v <= ceil;
			ctx.fillStyle = i === selected ? COL.a(COL.teal, 0.18) : COL.a(COL.teal, 0.05);
			ctx.fillRect(x - (x1 - x0) / n / 2 + 2, y0 - 8, (x1 - x0) / n - 4, 74);
			label(ctx, COL, s.name, x, y0 + 8, i === selected ? COL.foam : COL.muted, 'center', 9.5);
			label(ctx, COL, `${fmt(a, 0)}°`, x, y0 + 28, COL.tealHi, 'center', 11);
			label(ctx, COL, `${fmt(v, 1)} m/s`, x, y0 + 46, ok ? COL.good : COL.accent, 'center', 10);
			label(ctx, COL, ok ? 'makeable' : 'runs away', x, y0 + 60, ok ? COL.good : COL.accent, 'center', 9);
		});
		readout =
			`H<sub>b</sub>=<b>${fmt(Hb, 1)} m</b> → c<sub>b</sub>=√(2.0gH<sub>b</sub>)=<b>${fmt(cb, 1)} m/s</b> · at α=<b>${fmt(alpha, 0)}°</b> the break point runs at c/tanα=<b>${fmt(cb / Math.tan((alpha * Math.PI) / 180), 1)}</b> and you need c/sinα=<b>${fmt(vp, 1)} m/s</b> (${fmt(vp * 3.6, 0)} km/h)` +
			` · nothing tighter than sin α = c<sub>b</sub>/ceiling, <b>${fmt((Math.asin(cb / ceil) * 180) / Math.PI, 0)}°</b>, can be made, and then only off the drop`;
	}

	function pick(e: MouseEvent) {
		const cv = e.currentTarget as HTMLCanvasElement;
		const r = cv.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * 880, y = ((e.clientY - r.top) / r.height) * 400;
		if (y < 296) return;
		const n = spot.sections.length;
		const i = Math.floor(((x - 60) / (880 - 100)) * n);
		if (i >= 0 && i < n) {
			selected = i;
			alpha = sectionAlpha[i];
		}
	}
	$effect(() => {
		// the slider edits the selected section
		const a = alpha;
		const i = selected;
		if (sectionAlpha[i] !== undefined && sectionAlpha[i] !== a) sectionAlpha[i] = a;
	});
	$effect(() => {
		if (!canvas) return;
		const cv = canvas;
		cv.addEventListener('click', pick);
		return () => cv.removeEventListener('click', pick);
	});
</script>

<Frame title="Section speed: what a peeling wave asks of you" W={880} H={400} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="breaking face H_b" bind:value={Hb} min={0.5} max={5} step={0.1} display="{fmt(Hb, 1)} m" />
		<Slider label="peel angle α ({spot.sections[selected]?.name ?? 'section'})" bind:value={alpha} min={10} max={85} display="{fmt(alpha, 0)}°" />
	{/snippet}
	{#snippet caption()}
		The demand V<sub>p</sub> = c<sub>b</sub>/sin α against the drag-free ceiling c<sub>b</sub> + √(2gH<sub>b</sub>),
		with Scarfe's field bands for speed sections, re-entries and cutbacks. The review gives no peel angle per J-Bay
		section, so the strip starts every section at 45° for you to set; the 2-D simulation will measure them once it
		breaks.
	{/snippet}
</Frame>

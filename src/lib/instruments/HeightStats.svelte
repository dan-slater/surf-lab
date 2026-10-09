<!--
	Wave height statistics (reading-the-day chapter, section 5), from the
	chapter's equations: Rayleigh heights Pr{H <= h} = 1 - exp(-h^2 / 8 m0)
	with H_m0 = 4.004 sqrt(m0); H_rms = Hs / sqrt 2; the most probable largest
	of N waves Hs sqrt(0.5 ln N); the depth cap H_max / d = 0.75; and the
	breaker height from the review's shoaling chain.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp, fmt, breakerHeight } from './physics';
	import { axes, curve, label, vline } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, hours: hours0 = 3, depth = 2.5 }: SwellProps & { hours?: number; depth?: number } = $props();
	let H = $state(1.5);
	let T = $state(11);
	let hours = $state(3);
	let d = $state(2.5);
	$effect.pre(() => { H = clamp(Math.round(Hs * 10) / 10, 0.3, 6); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 5, 22); });
	$effect.pre(() => { hours = clamp(hours0, 0.5, 12); });
	$effect.pre(() => { d = clamp(depth, 0.5, 10); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 340, draw);

	function draw({ ctx, W, H: Hc, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, Hc);
		const m0 = (H / 4.004) ** 2;
		const pdf = (h: number) => (h / (4 * m0)) * Math.exp((-h * h) / (8 * m0));
		const exceed = (h: number) => Math.exp((-h * h) / (8 * m0));
		const N = (hours * 3600) / T;
		const Hmax = H * Math.sqrt(0.5 * Math.log(N));
		const cap = 0.75 * d;
		const Hrms = H / Math.SQRT2;
		const xMax = Math.max(2.6 * H, cap * 1.1);
		const yMax = pdf(2 * Math.sqrt(m0)) * 1.15; // pdf peaks at h = 2 sqrt(m0)
		const A = axes(ctx, COL, { x: 60, y: 20, w: W - 100, h: Hc - 70 }, [0, xMax], [0, yMax], {
			xTicks: Array.from({ length: Math.floor(xMax / 0.5) + 1 }, (_, i) => i * 0.5),
			xFmt: (v) => fmt(v, 1),
			xLabel: 'individual wave height [m]',
			yLabel: 'how often'
		});
		// shade the waves above Hs
		ctx.save();
		ctx.fillStyle = COL.a(COL.teal, 0.14);
		ctx.beginPath();
		ctx.moveTo(A.X(H), A.Y(0));
		for (let h = H; h <= xMax; h += xMax / 200) ctx.lineTo(A.X(h), A.Y(pdf(h)));
		ctx.lineTo(A.X(xMax), A.Y(0));
		ctx.closePath();
		ctx.fill();
		ctx.restore();
		curve(ctx, A, pdf, COL.teal, 2);
		const mark = (x: number, color: string, text: string, y: number) => {
			vline(ctx, A, x, color);
			label(ctx, COL, text, A.X(x) + 5, y, color);
		};
		mark(Hrms, COL.muted, `H_rms ${fmt(Hrms, 2)}`, 34);
		mark(H, COL.tealHi, `H_s ${fmt(H, 2)}`, 50);
		mark(Hmax, COL.gold, `biggest of ${fmt(N, 0)}: ${fmt(Hmax, 2)}`, 66);
		if (cap < xMax) mark(cap, COL.accent, `depth cap 0.75 d = ${fmt(cap, 2)}`, 82);

		const Hb = breakerHeight(H, T);
		readout =
			`<b>${fmt(100 * exceed(H), 1)}%</b> of waves beat H<sub>s</sub> · H<sub>rms</sub>=H<sub>s</sub>/√2=<b>${fmt(Hrms, 2)} m</b> · ${fmt(hours, 1)} h at ${fmt(T, 0)} s is N≈<b>${fmt(N, 0)}</b> waves, biggest ≈ H<sub>s</sub>√(½ln N)=<b>${fmt(Hmax, 2)} m</b>` +
			(Hmax > cap ? ` · <span class="bad">over ${fmt(d, 1)} m of bank it has already broken further out</span>` : '') +
			`<br>breaker height from the shoaling chain H<sub>b</sub>=<b>${fmt(Hb, 2)} m</b> face, about <b>${fmt((Hb / 2) * 3.281, 0)} ft</b> in traditional (Hawaiian) feet, which run near half the face`;
	}
</script>

<Frame title="Wave height statistics" W={880} H={340} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="significant height Hs" bind:value={H} min={0.3} max={6} step={0.1} display="{fmt(H, 1)} m" />
		<Slider label="period" bind:value={T} min={5} max={22} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="session" bind:value={hours} min={0.5} max={12} step={0.5} display="{fmt(hours, 1)} h" />
		<Slider label="bank depth" bind:value={d} min={0.5} max={10} step={0.1} display="{fmt(d, 1)} m" />
	{/snippet}
	{#snippet caption()}
		Deep-water heights are Rayleigh distributed about the spectrum's variance, so H<sub>s</sub> is the middle of the top
		third, not a ceiling: 13.5% of waves beat it, and the largest of N grows only as √(ln N). Over a shallow bank,
		breaking caps a wave near 0.75 of the depth. The shaded tail is the waves bigger than the buoy number.
	{/snippet}
</Frame>

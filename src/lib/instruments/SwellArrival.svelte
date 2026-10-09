<!--
	Distance sorting and sets (swell chapter, sections 1 and 4). Two panels from
	the chapter's own equations:
	  arrival: t = X / c_g with deep-water c_g = gT / 4 pi, i.e. the arriving
	           frequency f = g (t - t0) / (4 pi X), so long periods land first;
	  sets:    two components f and f (1 + df/f) beat with T_group = T / (df/f).
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { axes, curve, dot, label, vline } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Tp = DEFAULT_SWELL.Tp, distanceKm = 5000, bandwidth = 2 }: SwellProps & { distanceKm?: number; bandwidth?: number } = $props();

	let T = $state(15);
	let Xkm = $state(5000);
	let bw = $state(2);
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 8, 22); });
	$effect.pre(() => { Xkm = clamp(distanceKm, 500, 12000); });
	$effect.pre(() => { bw = clamp(bandwidth, 1, 15); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, { W: 880, H: 420, narrowH: () => 420 }, draw);

	/** Arrival time in seconds for period T over X metres, t = 4 pi X / (g T). */
	const arrival = (Tsec: number, Xm: number) => (4 * Math.PI * Xm) / (G * Tsec);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		const bx = narrow ? 44 : 60, boxW = W - (narrow ? 56 : 90);
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const X = Xkm * 1000;
		// --- arrival ridge: period against days since the storm
		const dayMax = Math.max(2, Math.ceil(arrival(8, X) / 86400 + 0.5));
		const A = axes(ctx, COL, { x: bx, y: 22, w: boxW, h: 170 }, [0, dayMax], [6, 22], {
			xTicks: Array.from({ length: dayMax + 1 }, (_, i) => i).filter((d) => !narrow || dayMax <= 6 || d % 2 === 0),
			yTicks: [8, 12, 16, 20],
			xLabel: 'days since the storm',
			yLabel: 'arriving period [s]'
		});
		for (const [xk, alpha] of [[X / 2, 0.25], [X * 2, 0.25]] as const) {
			curve(ctx, A, (d) => (4 * Math.PI * xk) / (G * d * 86400), COL.a(COL.teal, alpha), 1.2, [4, 4], [0.05, dayMax]);
		}
		curve(ctx, A, (d) => (4 * Math.PI * X) / (G * d * 86400), COL.teal, 2.2, [], [0.05, dayMax]);
		const tA = arrival(T, X) / 86400;
		vline(ctx, A, tA, COL.a(COL.accent, 0.7));
		dot(ctx, A.X(tA), A.Y(T), 4, COL.accent);
		label(ctx, COL, `${fmt(Xkm / 1000, 1)}k km`, A.X(Math.min(tA + 0.15, dayMax - 0.6)), A.Y(T) - 8, COL.tealHi);
		if (!narrow) label(ctx, COL, 'dashed: half and twice the distance', W - 34, 36, COL.muted, 'right');

		// --- sets: two components beating
		const f1 = 1 / T, f2 = f1 * (1 + bw / 100);
		const Tg = T / (bw / 100);
		const span = Math.min(2.4 * Tg, 4000);
		const B = axes(ctx, COL, { x: bx, y: 262, w: boxW, h: 110 }, [0, span], [-2.3, 2.3], {
			xTicks: niceTicks(span, narrow ? 4 : 8),
			xLabel: 'time at the beach [s]'
		});
		curve(ctx, B, (t) => Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t), COL.a(COL.tealHi, 0.75), 1, [], [0, span], 2400);
		curve(ctx, B, (t) => Math.abs(2 * Math.cos(Math.PI * (f2 - f1) * t)), COL.gold, 1.4, [5, 4], [0, span], 600);
		label(ctx, COL, 'envelope', B.X(Tg) + 6, B.Y(2.05), COL.gold);
		if (Tg / 2 < span) label(ctx, COL, 'lull', B.X(Tg / 2), B.Y(-2.15), COL.muted, 'center');
		label(ctx, COL, `${fmt(bw, 0)}% band: groups every ${fmt(Tg, 0)} s`, W - (narrow ? 8 : 34), 252, COL.tealHi, 'right');

		const cg = (G * T) / (4 * Math.PI);
		readout =
			`T=<b>${fmt(T, 1)} s</b>: c<sub>g</sub>=<b>${fmt(cg, 1)} m/s</b> (${fmt(1.5 * T, 0)} kn by the 1.5T rule) · from ${fmt(Xkm, 0)} km it arrives after <b>${fmt(arrival(T, X) / 86400, 1)} days</b>` +
			` · 18 s lands ${fmt((arrival(T, X) - arrival(18, X)) / 3600, 0)} h before it<br>` +
			`group interval T/(Δf/f)=<b>${fmt(Tg, 0)} s</b> (${fmt(Tg / 60, 1)} min) · about <b>${fmt(100 / bw, 0)}</b> waves per group, few of them at the top`;
	}

	function niceTicks(span: number, most: number) {
		const step = [50, 100, 200, 250, 500, 1000, 2000].find((s) => span / s <= most) ?? 2000;
		return Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
	}
</script>

<Frame title="Distance sorts the swell" W={880} H={420} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="period T" bind:value={T} min={8} max={22} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="storm distance" bind:value={Xkm} min={500} max={12000} step={100} display="{fmt(Xkm, 0)} km" />
		<Slider label="bandwidth Δf/f" bind:value={bw} min={1} max={15} step={0.5} display="{fmt(bw, 1)}%" />
	{/snippet}
	{#snippet caption()}
		Top: the period arriving at your beach after a storm at that distance, from f = g(t − t₀)/(4πX); long periods
		outrun short ones, so the period falls as the event runs on. Bottom: two components a fraction Δf/f apart beat
		into sets every T/(Δf/f). An ocean crossing narrows the band toward 2%; a local wind sea sits near 10%.
	{/snippet}
</Frame>

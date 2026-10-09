<!--
	Breaker type and the Iribarren number (breaking chapter, section 4), from
	xi_0 = tan(alpha) / sqrt(H_0 / L_0), L_0 = g T^2 / 2 pi, with the chapter's
	bands: spilling below 0.5, plunging 0.5 to 3.3, surging above.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp, fmt, deepLength, iribarren, breakerType } from './physics';
	import { axes, curve, dot, fitLabel, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, slope: slope0 = 1 / 30 }: SwellProps & { slope?: number } = $props();
	let H0 = $state(2.5);
	let T = $state(15);
	/** seabed steepness as 1:n */
	let n = $state(30);
	$effect.pre(() => { H0 = clamp(Math.round(Hs * 10) / 10, 0.3, 5); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 5, 22); });
	$effect.pre(() => { n = clamp(Math.round(1 / slope0), 3, 100); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, { W: 880, H: 340, narrowH: (w) => Math.max(280, w * 0.85) }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const maxTan = 0.35;
		const xiMax = 5;
		const A = axes(ctx, COL, { x: narrow ? 46 : 60, y: 20, w: W - (narrow ? 56 : 100), h: H - 70 }, [0, maxTan], [0, xiMax], {
			xTicks: narrow ? [0, 0.1, 0.2, 0.3] : [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
			yTicks: [0, 0.5, 1, 2, 3.3, 4, 5],
			xFmt: (v) => (v === 0 ? '0' : `1:${fmt(1 / v, 0)}`),
			xLabel: 'seabed slope tan α',
			yLabel: 'Iribarren ξ₀'
		});
		// bands
		const band = (lo: number, hi: number, color: string, name: string) => {
			ctx.fillStyle = color;
			ctx.fillRect(A.box.x, A.Y(hi), A.box.w, A.Y(lo) - A.Y(hi));
			label(ctx, COL, name, A.box.x + A.box.w - 8, A.Y(hi) + 14, COL.muted, 'right');
		};
		band(0, 0.5, COL.a(COL.teal, 0.07), 'SPILLING');
		band(0.5, 3.3, COL.a(COL.accent, 0.07), 'PLUNGING');
		band(3.3, xiMax, COL.a(COL.gold, 0.06), 'SURGING');
		// xi against slope for this swell, and for 8 s and 20 s at the same height
		for (const [t, style, w] of [[8, COL.a(COL.tealHi, 0.35), 1], [20, COL.a(COL.tealHi, 0.35), 1], [T, COL.teal, 2.2]] as const) {
			curve(ctx, A, (s) => iribarren(s, H0, t), style, w);
			if (t !== T && !narrow) {
				const s = Math.min(maxTan * 0.92, 4.6 / (1 / Math.sqrt(H0 / deepLength(t))));
				label(ctx, COL, `${t} s`, A.X(s) + 4, A.Y(iribarren(s, H0, t)) - 4, COL.muted);
			}
		}
		const tan = 1 / n;
		const xi = iribarren(tan, H0, T);
		dot(ctx, A.X(tan), A.Y(Math.min(xi, xiMax)), 5, COL.accent);
		fitLabel(ctx, COL, breakerType(xi), A.X(tan) + 5, A.Y(Math.min(xi, xiMax)) + 4, COL.accent, A.box.x + A.box.w);
		readout =
			`L₀=<b>${fmt(deepLength(T), 0)} m</b> · √(H₀/L₀)=<b>${fmt(Math.sqrt(H0 / deepLength(T)), 3)}</b> · on a 1:${fmt(n, 0)} bed ξ₀=<b>${fmt(xi, 2)}</b> → <b>${breakerType(xi)}</b>` +
			` · Galvin's H₀/(L₀m²)=1/ξ₀²=<b>${fmt(1 / (xi * xi), 2)}</b>: slope enters squared`;
	}
</script>

<Frame title="Breaker type: the Iribarren number" W={880} H={340} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="deep height H₀" bind:value={H0} min={0.3} max={5} step={0.1} display="{fmt(H0, 1)} m" />
		<Slider label="period T" bind:value={T} min={5} max={22} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="seabed slope" bind:value={n} min={3} max={100} display="1:{n}" />
	{/snippet}
	{#snippet caption()}
		Beach slope divided by deep-water steepness. Teal: ξ₀ against slope for this swell; faint curves: the same height
		at 8 s and 20 s. Thresholds are the offshore ones (0.5, 3.3); measured at the break point they are 0.4 and 2.0.
	{/snippet}
</Frame>

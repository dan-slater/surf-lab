<!--
	Rip currents pulse (reading-the-day chapter, section 4), from the chapter's
	key equation U_rms,ig = eta_rms,ig sqrt(g / h) added to a steady mean, and
	its worked example: surge = mean + U_rms, lull = mean, on a beat of 25 to
	250 s. The square pulse is a picture of "surge then lull", not a measured
	time series.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { axes, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { eta: eta0 = 0.15, mean: mean0 = 0.4 }: SwellProps & { eta?: number; mean?: number } = $props();
	let eta = $state(0.15);
	let mean = $state(0.4);
	let channel = $state(1.5);
	let shoal = $state(0.8);
	let beat = $state(90);
	$effect.pre(() => { eta = clamp(eta0, 0.02, 0.4); });
	$effect.pre(() => { mean = clamp(mean0, 0, 1); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 320, draw);

	function draw({ ctx, W, H, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const uc = eta * Math.sqrt(G / channel);
		const us = eta * Math.sqrt(G / shoal);
		const span = 600;
		const A = axes(ctx, COL, { x: 60, y: 20, w: W - 100, h: H - 80 }, [0, span], [0, 2.5], {
			xTicks: [0, 100, 200, 300, 400, 500, 600],
			yTicks: [0, 0.5, 1, 1.5, 2, 2.5],
			xLabel: 'time [s]',
			yLabel: 'speed [m/s]'
		});
		const series = (u: number, extra: number, style: string, width: number, dash: number[] = []) => {
			ctx.save();
			ctx.strokeStyle = style;
			ctx.lineWidth = width;
			ctx.setLineDash(dash);
			ctx.beginPath();
			for (let t = 0; t <= span; t += 1) {
				const surge = Math.floor((2 * t) / beat) % 2 === 0;
				const y = A.Y(extra + mean + (surge ? u : 0));
				t === 0 ? ctx.moveTo(A.X(t), y) : ctx.lineTo(A.X(t), y);
			}
			ctx.stroke();
			ctx.restore();
		};
		series(us, 0, COL.a(COL.gold, 0.6), 1.2, [4, 4]);
		series(uc, 0, COL.teal, 2);
		series(uc, 1, COL.accent, 1.6);
		label(ctx, COL, 'rip in the channel', A.X(span) - 4, A.Y(mean + uc) - 6, COL.teal, 'right');
		label(ctx, COL, 'surge on the shoal beside it', A.X(span) - 4, A.Y(mean + us) - 6, COL.gold, 'right');
		label(ctx, COL, 'you paddling 1 m/s in the channel, over the ground', A.X(span) - 4, A.Y(1 + mean + uc) - 6, COL.accent, 'right');

		readout =
			`U<sub>rms,ig</sub> = η√(g/h): channel ${fmt(channel, 1)} m → <b>${fmt(uc, 2)} m/s</b>, shoal ${fmt(shoal, 1)} m → <b>${fmt(us, 2)} m/s</b>` +
			` · channel runs <b>${fmt(mean + uc, 2)}</b> in a surge, <b>${fmt(mean, 2)}</b> in a lull · paddling at 1 m/s you make <b>${fmt(1 + mean + uc, 1)}</b> then <b>${fmt(1 + mean, 1)} m/s</b> over the ground`;
	}
</script>

<Frame title="Rip currents pulse" W={880} H={320} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="infragravity η rms" bind:value={eta} min={0.02} max={0.4} step={0.01} display="{fmt(eta, 2)} m" />
		<Slider label="mean rip" bind:value={mean} min={0} max={1} step={0.05} display="{fmt(mean, 2)} m/s" />
		<Slider label="channel depth" bind:value={channel} min={0.5} max={4} step={0.1} display="{fmt(channel, 1)} m" />
		<Slider label="shoal depth" bind:value={shoal} min={0.3} max={2} step={0.1} display="{fmt(shoal, 1)} m" />
		<Slider label="beat" bind:value={beat} min={25} max={250} step={5} display="{fmt(beat, 0)} s" />
	{/snippet}
	{#snippet caption()}
		A rip is a modest steady flow plus surges on the wave-group timescale. The surge scales as one over the square root
		of depth, so it is weaker in the deep channel than on the shoal beside it. The free ride out is real but arrives in
		pulses: work through the lulls and let the surges carry you.
	{/snippet}
</Frame>

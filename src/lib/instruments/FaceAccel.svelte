<!--
	Where the wave accelerates you, and where the drive comes from (riding
	chapter, sections 3 and 4), from the chapter's key equations: Pizzo's
	reduced gravity A = 1/2 g sin(2 theta), bounded by g/2 at 45 degrees; the
	time to gain sqrt(2 g H) sliding down a face of slope theta,
	t = sqrt(2 g H) / (g sin theta); and the power the advancing face feeds
	you in trim, P = M c g sin(theta) cos(theta).
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { axes, curve, dot, label, vline } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { angle = 30, height = 2, celerity = 6.3, mass = 90 }: SwellProps & { angle?: number; height?: number; celerity?: number; mass?: number } = $props();
	let th = $state(30);
	let Hf = $state(2);
	let c = $state(6.3);
	let M = $state(90);
	$effect.pre(() => { th = clamp(angle, 1, 89); });
	$effect.pre(() => { Hf = clamp(height, 0.5, 5); });
	$effect.pre(() => { c = clamp(celerity, 2, 10); });
	$effect.pre(() => { M = clamp(mass, 40, 130); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	// narrow: the power plot stacks under the acceleration plot
	useStage(() => canvas, { W: 880, H: 330, narrowH: () => 430 }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const rad = (d: number) => (d * Math.PI) / 180;
		const A = axes(ctx, COL, narrow ? { x: 44, y: 16, w: W - 56, h: 180 } : { x: 60, y: 20, w: 470, h: H - 70 }, [0, 90], [0, 0.55], {
			xTicks: narrow ? [0, 30, 45, 60, 90] : [0, 15, 30, 45, 60, 75, 90],
			yTicks: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
			xLabel: 'face angle θ [deg]',
			yLabel: 'A / g'
		});
		curve(ctx, A, (t) => 0.5 * Math.sin(2 * rad(t)), COL.teal, 2.2);
		for (const t of [20, 30, 45, 60]) {
			dot(ctx, A.X(t), A.Y(0.5 * Math.sin(2 * rad(t))), 3, COL.tealHi);
			label(ctx, COL, fmt(0.5 * Math.sin(2 * rad(t)), 2), A.X(t), A.Y(0.5 * Math.sin(2 * rad(t))) - 8, COL.muted, 'center');
		}
		vline(ctx, A, th, COL.a(COL.accent, 0.7));
		dot(ctx, A.X(th), A.Y(0.5 * Math.sin(2 * rad(th))), 5, COL.accent);

		// right: power the face feeds you, P = M c g sin cos, against angle
		const B = axes(ctx, COL, narrow ? { x: 44, y: 262, w: W - 56, h: 120 } : { x: 610, y: 20, w: W - 640, h: H - 70 }, [0, 90], [0, 3.5], {
			xTicks: [0, 30, 60, 90],
			yTicks: [0, 1, 2, 3],
			xLabel: 'θ [deg]',
			yLabel: 'P [kW]'
		});
		curve(ctx, B, (t) => (M * c * G * Math.sin(rad(t)) * Math.cos(rad(t))) / 1000, COL.gold, 2);
		dot(ctx, B.X(th), B.Y((M * c * G * Math.sin(rad(th)) * Math.cos(rad(th))) / 1000), 5, COL.accent);

		const a = 0.5 * G * Math.sin(2 * rad(th));
		const vrel = Math.sqrt(2 * G * Hf);
		const t = vrel / (G * Math.sin(rad(th)));
		const P = M * c * G * Math.sin(rad(th)) * Math.cos(rad(th));
		readout =
			`θ=<b>${fmt(th, 0)}°</b>: A = ½g sin 2θ = <b>${fmt(a, 1)} m/s²</b> (${fmt(a / G, 2)}g) · a ${fmt(Hf, 1)} m face gives up √(2gH)=<b>${fmt(vrel, 1)} m/s</b> relative to the wave, in about <b>${fmt(t, 1)} s</b>` +
			` · the face feeds ${fmt(M, 0)} kg at c=${fmt(c, 1)} m/s with P = Mc g sinθ cosθ = <b>${fmt(P / 1000, 2)} kW</b>`;
	}
</script>

<Frame title="Where the wave accelerates you" W={880} H={330} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="face angle θ" bind:value={th} min={1} max={89} display="{fmt(th, 0)}°" />
		<Slider label="face height" bind:value={Hf} min={0.5} max={5} step={0.1} display="{fmt(Hf, 1)} m" />
		<Slider label="wave speed c" bind:value={c} min={2} max={10} step={0.1} display="{fmt(c, 1)} m/s" />
		<Slider label="rider + board" bind:value={M} min={40} max={130} display="{fmt(M, 0)} kg" />
	{/snippet}
	{#snippet caption()}
		Left: the horizontal acceleration of something already moving with the wave is set by the local slope alone and
		peaks at g/2 on a 45° face. Slope sets the rate, height sets the total. Right: the advancing face does work on you,
		so trimming at a fixed height still feeds you power; the steep pocket pays most, the flat shoulder least.
	{/snippet}
</Frame>

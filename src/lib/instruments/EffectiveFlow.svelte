<!--
	The flow you ride (riding chapter, section 1), from the chapter's key
	equation: in the wave's frame V_w(h) = sqrt(V_crest^2 + 2 g (H - h)),
	slowest at the crest, fastest in the trough. Ground-frame water speed is
	V_w - c in the trough (seaward) and c - V_crest at the crest (shoreward).
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { arrow, fitLabel, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { height = 2, celerity = 5, crestFlow = 3.5 }: SwellProps & { height?: number; celerity?: number; crestFlow?: number } = $props();
	let Hw = $state(2);
	let c = $state(5);
	let vc = $state(3.5);
	$effect.pre(() => { Hw = clamp(height, 0.5, 5); });
	$effect.pre(() => { c = clamp(celerity, 2, 10); });
	$effect.pre(() => { vc = clamp(crestFlow, 0, 8); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, { W: 880, H: 340, narrowH: (w) => Math.max(290, w * 0.85) }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const Vw = (h: number) => Math.sqrt(vc * vc + 2 * G * (Hw - h));
		// wave profile travelling right: forward face on the right of the crest
		const base = H - 70, amp = 170 / 5; // px per metre (5 m fills the frame)
		const crestX = narrow ? W * 0.3 : 430, Lpx = narrow ? W * 1.15 : 520;
		const surf = (x: number) => base - Hw * amp * (0.5 + 0.5 * Math.cos(((x - crestX) / Lpx) * 2 * Math.PI)) ** 1.6;
		ctx.strokeStyle = COL.teal;
		ctx.lineWidth = 2;
		ctx.beginPath();
		for (let x = 20; x <= W - 20; x += 3) x === 20 ? ctx.moveTo(x, surf(x)) : ctx.lineTo(x, surf(x));
		ctx.stroke();
		label(ctx, COL, `wave advances at c = ${fmt(c, 1)} m/s →`, W - (narrow ? 8 : 30), 30, COL.muted, 'right');
		// arrows on the forward face at h/H = 1, 0.5, 0, pointing up the face (flow runs trough → crest in the wave frame)
		const scale = 14; // px per m/s
		for (const frac of [1, 0.5, 0.05]) {
			const h = frac * Hw;
			// find x on the forward face (right of crest) with this height
			let x = crestX;
			while (x < crestX + Lpx / 2 && base - surf(x) > h * amp) x += 1;
			const y = surf(x);
			const dx = 2, slope = (surf(x + dx) - surf(x - dx)) / (2 * dx);
			const len = Vw(h) * scale;
			const n = Math.hypot(1, slope);
			// up the face is toward the crest, i.e. leftward along the surface
			const ux = -1 / n, uy = -slope / n;
			arrow(ctx, x + 6 - ux * len, y - 6 - uy * len, x + 6, y - 6, frac === 0.05 ? COL.accent : COL.gold, 2);
			fitLabel(ctx, COL, `h/H = ${frac === 0.05 ? 0 : frac}: ${fmt(Vw(frac === 0.05 ? 0 : h), 1)} m/s`, x + 10, y + 16, COL.muted, W - 4);
		}
		const vt = Vw(0);
		const Hlim = (2 * c * c) / G;
		readout =
			`wave frame: crest <b>${fmt(vc, 1)}</b>, mid face <b>${fmt(Vw(Hw / 2), 1)}</b>, trough <b>${fmt(vt, 1)} m/s</b>` +
			` · ground frame: trough water runs seaward at <b>${fmt(vt - c, 1)} m/s</b>, crest water shoreward at <b>${fmt(c - vc, 1)} m/s</b>` +
			` · the 2c = ${fmt(2 * c, 1)} m/s trough flow needs the limiting wave, H = 2c²/g = ${fmt(Hlim, 1)} m`;
	}
</script>

<Frame title="The flow you ride" W={880} H={340} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="wave height H" bind:value={Hw} min={0.5} max={5} step={0.1} display="{fmt(Hw, 1)} m" />
		<Slider label="celerity c" bind:value={c} min={2} max={10} step={0.1} display="{fmt(c, 1)} m/s" />
		<Slider label="crest flow" bind:value={vc} min={0} max={8} step={0.1} display="{fmt(vc, 1)} m/s" />
	{/snippet}
	{#snippet caption()}
		Ride in the wave's frame and the water streams up the face and over the crest. Bernoulli along the surface gives
		its speed at each height; arrows are drawn to scale. The fastest water is at the base of the face, coming at you,
		which is the flow a bottom turn is set into.
	{/snippet}
</Frame>

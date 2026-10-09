<!--
	Wave power and reach (swell chapter, section 5), from the chapter's own
	equations: buoy-form power P = rho g^2 Hs^2 Tp / (64 pi) (the regular-wave
	form doubles it), and the wave base L/2 = g T^2 / (4 pi), about 0.78 T^2.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { label } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp }: SwellProps = $props();
	let H = $state(2.5);
	let T = $state(15);
	$effect.pre(() => { H = clamp(Math.round(Hs * 10) / 10, 0.5, 6); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 5, 22); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 380, draw);

	const RHO = 1025;
	const power = (h: number, t: number) => (RHO * G * G * h * h * t) / (64 * Math.PI); // W per metre of crest
	const waveBase = (t: number) => (G * t * t) / (4 * Math.PI);

	function draw({ ctx, W, H: Hc, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, Hc);
		// side section: depth scale 0..350 m, sea floor rising from left to a beach at the right
		const top = 40, bot = Hc - 30, left = 70, right = W - 40, dMax = 350;
		const Yd = (d: number) => top + (d / dMax) * (bot - top);
		const floorD = (x: number) => dMax * Math.pow(1 - (x - left) / (right - left), 1.6);
		ctx.beginPath();
		ctx.moveTo(left, bot);
		for (let x = left; x <= right; x += 4) ctx.lineTo(x, Yd(floorD(x)));
		ctx.lineTo(right, bot);
		ctx.closePath();
		ctx.fillStyle = COL.land;
		ctx.fill();
		// surface with one long crest
		ctx.strokeStyle = COL.teal;
		ctx.lineWidth = 1.6;
		ctx.beginPath();
		for (let x = left; x <= right; x += 4) {
			const y = top - 6 * Math.cos(((x - left) / (right - left)) * 2 * Math.PI * 1.5);
			x === left ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
		}
		ctx.stroke();
		// depth ticks
		ctx.font = COL.font(10);
		ctx.fillStyle = COL.muted;
		ctx.textAlign = 'right';
		for (const d of [0, 50, 100, 150, 200, 250, 300, 350]) ctx.fillText(`${d} m`, left - 8, Yd(d) + 3);
		ctx.textAlign = 'left';
		// wave base lines for 8, 14, 20 s, plus the current period
		for (const [t, strong] of [[8, false], [14, false], [20, false], [T, true]] as const) {
			const d = waveBase(t);
			if (d > dMax) continue;
			ctx.strokeStyle = strong ? COL.accent : COL.a(COL.tealHi, 0.45);
			ctx.lineWidth = strong ? 1.6 : 1;
			ctx.setLineDash([6, 5]);
			ctx.beginPath();
			ctx.moveTo(left, Yd(d));
			ctx.lineTo(right, Yd(d));
			ctx.stroke();
			ctx.setLineDash([]);
			label(ctx, COL, `${fmt(t, strong ? 1 : 0)} s swell feels bottom at ${fmt(d, 0)} m`, strong ? right - 4 : left + 10, Yd(d) - 5, strong ? COL.accent : COL.muted, strong ? 'right' : 'left');
		}
		label(ctx, COL, 'wave base = L/2 = gT²/4π ≈ 0.78 T² m', right - 4, top + 22, COL.muted, 'right');

		const P = power(H, T);
		const Heq6 = H * Math.sqrt(T / 6); // equal power at 6 s, H ∝ T^(-1/2)
		readout =
			`H<sub>s</sub>=<b>${fmt(H, 1)} m</b>, T<sub>p</sub>=<b>${fmt(T, 1)} s</b> → P = ρg²H<sub>s</sub>²T<sub>p</sub>/64π = <b>${fmt(P / 1000, 1)} kW</b> per metre of crest (regular-wave form ${fmt((2 * P) / 1000, 1)} kW/m)` +
			`<br>the same power at 6 s needs H = <b>${fmt(Heq6, 2)} m</b> · wave base <b>${fmt(waveBase(T), 0)} m</b>, where this swell starts to shoal and refract`;
	}
</script>

<Frame title="Wave power and how deep a swell reaches" W={880} H={380} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="significant height Hs" bind:value={H} min={0.5} max={6} step={0.1} display="{fmt(H, 1)} m" />
		<Slider label="peak period Tp" bind:value={T} min={5} max={22} step={0.5} display="{fmt(T, 1)} s" />
	{/snippet}
	{#snippet caption()}
		Power per metre of crest goes as height squared but period only to the first power. What long period buys is reach:
		the depth where orbital motion fades goes as period squared, so long swell starts to bend far offshore. Depth drawn
		true to scale; the seabed shape is schematic.
	{/snippet}
</Frame>

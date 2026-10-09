<!--
	The catching gap (catching chapter, sections 2 and 3), from the chapter's
	numbers and equations: wave speed at the takeoff c_b = sqrt(2 g H_b), the
	measured paddling ranges (endurance 0.8 to 1.1 m/s, sprint 1.6 to 1.9 m/s),
	and the distance the crest gains before you match it, d = (c - u0)^2 / 2a
	with a = g sin(theta). Drag and the slope building from zero are ignored,
	as in the chapter, so real figures are worse.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt, breakCelerity } from './physics';
	import { label } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { face = 1.5, faceAngle = 25, paddle = 1.8 }: SwellProps & { face?: number; faceAngle?: number; paddle?: number } = $props();
	let Hb = $state(1.5);
	let theta = $state(25);
	let u0 = $state(1.8);
	$effect.pre(() => { Hb = clamp(face, 0.5, 4); });
	$effect.pre(() => { theta = clamp(faceAngle, 5, 45); });
	$effect.pre(() => { u0 = clamp(paddle, 0, 2.2); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 400, draw);

	function draw({ ctx, W, H, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const c = breakCelerity(Hb);
		// --- speed scale 0..10 m/s with labelled bars
		const x0 = 200, x1 = W - 40, vMax = 10;
		const V = (v: number) => x0 + (v / vMax) * (x1 - x0);
		ctx.font = COL.font(10);
		ctx.strokeStyle = COL.grid;
		ctx.fillStyle = COL.muted;
		ctx.textAlign = 'center';
		for (let v = 0; v <= vMax; v += 1) {
			ctx.beginPath();
			ctx.moveTo(V(v), 18);
			ctx.lineTo(V(v), 180);
			ctx.stroke();
			ctx.fillText(String(v), V(v), 194);
		}
		ctx.fillText('speed [m/s]', (x0 + x1) / 2, 208);
		ctx.textAlign = 'left';
		const bars: [string, number, number, string][] = [
			['endurance paddle', 0.8, 1.1, COL.gold],
			['sprint paddle', 1.6, 1.9, COL.gold],
			['1.5 m face at the break', 0, breakCelerity(1.5), COL.a(COL.teal, 0.45)],
			['2 m face', 0, breakCelerity(2), COL.a(COL.teal, 0.45)],
			['3.6 m face, double overhead', 0, breakCelerity(3.6), COL.a(COL.teal, 0.45)],
			[`this wave, ${fmt(Hb, 1)} m face`, 0, c, COL.teal]
		];
		bars.forEach(([name, lo, hi, color], i) => {
			const y = 24 + i * 26;
			ctx.fillStyle = color;
			ctx.fillRect(V(lo), y, Math.max(2, V(hi) - V(lo)), 14);
			label(ctx, COL, name, x0 - 10, y + 11, i === 5 ? COL.tealHi : COL.muted, 'right');
			label(ctx, COL, lo > 0 ? `${fmt(lo, 1)}–${fmt(hi, 1)}` : fmt(hi, 1), V(hi) + 6, y + 11, COL.muted);
		});

		// --- the face in the wave's frame: incline at theta, distances to match speed
		const a = G * Math.sin((theta * Math.PI) / 180);
		const dGo = ((c - u0) * (c - u0)) / (2 * a);
		const dStill = (c * c) / (2 * a);
		const by = H - 26, bx = 120, scale = 52; // px per metre along the face
		const th = (theta * Math.PI) / 180;
		const along = (d: number): [number, number] => [bx + d * scale * Math.cos(th), by - d * scale * Math.sin(th)];
		const faceLen = Math.min(12, Math.max(dStill * 1.15, 4));
		ctx.strokeStyle = COL.teal;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(bx - 40, by);
		ctx.lineTo(bx, by);
		ctx.lineTo(...along(faceLen));
		ctx.stroke();
		const mark = (d: number, color: string, text: string, dy: number) => {
			const [x, y] = along(d);
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, 7);
			ctx.fill();
			label(ctx, COL, text, x + 10, y + dy, color);
		};
		mark(dStill, COL.muted, `from a standstill: ${fmt(dStill, 1)} m`, -8);
		mark(dGo, COL.accent, `arriving at ${fmt(u0, 1)} m/s: ${fmt(dGo, 1)} m`, 14);
		label(ctx, COL, `face at ${fmt(theta, 0)}°, wave frame: the crest gains d before you match c`, bx - 40, by + 18, COL.muted);

		readout =
			`c<sub>b</sub> = √(2gH<sub>b</sub>) = <b>${fmt(c, 1)} m/s</b> against a sprint of 1.6–1.9 m/s: short by about <b>${fmt(c / 1.8, 1)}×</b>` +
			` · a = g sin θ = <b>${fmt(a, 1)} m/s²</b> · d = (c − u₀)²/2a = <b>${fmt(dGo, 1)} m</b> in ${fmt((c - u0) / a, 1)} s, from rest ${fmt(dStill, 1)} m: the head start saves <b>${fmt(100 * (1 - dGo / dStill), 0)}%</b>`;
	}
</script>

<Frame title="Catching: the speed gap and how it closes" W={880} H={400} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="face height H_b" bind:value={Hb} min={0.5} max={4} step={0.1} display="{fmt(Hb, 1)} m" />
		<Slider label="face angle θ" bind:value={theta} min={5} max={45} display="{fmt(theta, 0)}°" />
		<Slider label="your speed u₀" bind:value={u0} min={0} max={2.2} step={0.1} display="{fmt(u0, 1)} m/s" />
	{/snippet}
	{#snippet caption()}
		Top: the wave arrives at 5 to 6 m/s and your best sprint is under 2 m/s. Bottom: what closes the gap is gravity
		along the tilted face. The crest gains d = (c − u₀)²/2a on you before you match its speed; if d is more than your
		distance to the crest, the wave passes under you. Drag is ignored, so real numbers are worse.
	{/snippet}
</Frame>

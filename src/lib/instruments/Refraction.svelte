<!--
	Swell direction over straight contours (reading-the-day chapter, section 1),
	from the chapter's key equation: sin(a) / sin(a0) = c / c0 = tanh(kh),
	K_R = sqrt(cos a0 / cos a), H = H0 K_R K_S, with the break at
	h_b = 1.28 H_b for H_b from the review's shoaling chain.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt, phaseSpeed, shoalK, breakerHeight, breakDepth } from './physics';
	import { axes, curve, label, vline } from './plot';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, angle = 30 }: SwellProps & { angle?: number } = $props();
	let H0 = $state(1.5);
	let T = $state(14);
	let a0 = $state(30);
	$effect.pre(() => { H0 = clamp(Math.round(Hs * 10) / 10, 0.3, 5); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 5, 22); });
	$effect.pre(() => { a0 = clamp(angle, 0, 80); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	// narrow: the plan view sits above the plot instead of beside it
	useStage(() => canvas, { W: 880, H: 400, narrowH: () => 520 }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const c0 = (G * T) / (2 * Math.PI);
		const r0 = (a0 * Math.PI) / 180;
		const ang = (h: number) => Math.asin(clamp((Math.sin(r0) * phaseSpeed(T, h)) / c0, -1, 1));
		const KR = (h: number) => Math.sqrt(Math.cos(r0) / Math.cos(ang(h)));
		const Hb = breakerHeight(H0, T);
		const hb = breakDepth(Hb);

		// left: plan view, crests bending to the contours
		const px = narrow ? 8 : 20, pw = narrow ? W - 16 : 300, py = narrow ? 8 : 20, ph = narrow ? 230 : H - 60;
		ctx.fillStyle = COL.land;
		ctx.fillRect(px, py + ph - 18, pw, 18);
		label(ctx, COL, 'BEACH', px + 6, py + ph - 5, COL.muted);
		const dMax = 60;
		const yOf = (h: number) => py + ph - 18 - (h / dMax) * (ph - 18);
		ctx.strokeStyle = COL.grid;
		for (const h of [5, 20, 50]) {
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(px, yOf(h));
			ctx.lineTo(px + pw, yOf(h));
			ctx.stroke();
			ctx.setLineDash([]);
			label(ctx, COL, `${h} m`, px + pw - 4, yOf(h) - 4, COL.muted, 'right');
		}
		// crest segments: at depth h the crest makes angle a(h) with the contours
		ctx.save();
		ctx.beginPath();
		ctx.rect(px, py, pw, ph - 18);
		ctx.clip();
		ctx.strokeStyle = COL.tealHi;
		ctx.lineWidth = 1.4;
		for (let h = 56; h > 0.6; h *= 0.72) {
			const a = h > 58 ? r0 : ang(h);
			const y = yOf(h), cx = px + pw / 2, half = Math.min(120, pw / 2 - 12);
			ctx.beginPath();
			ctx.moveTo(cx - half * Math.cos(a), y + half * Math.sin(a));
			ctx.lineTo(cx + half * Math.cos(a), y - half * Math.sin(a));
			ctx.stroke();
		}
		ctx.restore();
		ctx.strokeStyle = COL.accent;
		ctx.setLineDash([6, 5]);
		ctx.beginPath();
		ctx.moveTo(px, yOf(hb));
		ctx.lineTo(px + pw, yOf(hb));
		ctx.stroke();
		ctx.setLineDash([]);
		label(ctx, COL, `breaks at ${fmt(hb, 1)} m`, px + 6, yOf(hb) - 5, COL.accent);

		// right: angle and coefficients against depth
		const A = axes(ctx, COL, narrow ? { x: 44, y: 290, w: W - 56, h: H - 340 } : { x: 400, y: 20, w: W - 450, h: H - 70 }, [0, 60], [0, 2], {
			xTicks: narrow ? [0, 20, 40, 60] : [0, 10, 20, 30, 40, 50, 60],
			yTicks: [0, 0.5, 1, 1.5, 2],
			xLabel: 'depth h [m]'
		});
		curve(ctx, A, (h) => ang(h) / r0 || 0, COL.teal, 2, [], [0.3, 60]);
		curve(ctx, A, (h) => KR(h), COL.gold, 1.6, [], [0.3, 60]);
		curve(ctx, A, (h) => shoalK(T, h), COL.a(COL.accent, 0.6), 1.2, [4, 4], [0.3, 60]);
		curve(ctx, A, (h) => KR(h) * shoalK(T, h), COL.accent, 1.8, [], [0.3, 60]);
		vline(ctx, A, hb, COL.a(COL.accent, 0.6));
		label(ctx, COL, 'a / a₀', A.X(48), A.Y(ang(48) / r0 || 0) - 6, COL.teal);
		label(ctx, COL, 'K_R', A.X(48), A.Y(KR(48)) + 14, COL.gold);
		label(ctx, COL, 'K_R K_S', A.X(4), A.Y(Math.min(1.95, KR(4) * shoalK(T, 4))) - 6, COL.accent);

		const ab = ang(hb);
		readout =
			`c₀=<b>${fmt(c0, 1)} m/s</b> · at h<sub>b</sub>=<b>${fmt(hb, 2)} m</b> (H<sub>b</sub>=${fmt(Hb, 2)} m): sin a = ${fmt(Math.sin(r0), 2)}×c/c₀ → a=<b>${fmt((ab * 180) / Math.PI, 1)}°</b>` +
			` · K<sub>R</sub>=<b>${fmt(KR(hb), 2)}</b> · K<sub>S</sub>=${fmt(shoalK(T, hb), 2)} · H=H₀K<sub>R</sub>K<sub>S</sub>=<b>${fmt(H0 * KR(hb) * shoalK(T, hb), 2)} m</b>`;
	}
</script>

<Frame title="Swell direction and refraction" W={880} H={400} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="angle to contours a₀" bind:value={a0} min={0} max={80} display="{fmt(a0, 0)}°" />
		<Slider label="period T" bind:value={T} min={5} max={22} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="offshore height H₀" bind:value={H0} min={0.3} max={5} step={0.1} display="{fmt(H0, 1)} m" />
	{/snippet}
	{#snippet caption()}
		Straight, parallel contours. Left: crests swing toward the beach as the wave slows. Right: the crest angle as a
		fraction of its offshore value, the refraction coefficient K<sub>R</sub>, shoaling K<sub>S</sub> (dashed) and their
		product. Over straight contours refraction only ever lowers the height; focusing on a headland and shadowing behind
		land need curved contours or an obstacle, which this plane model does not have (P3 shows a real coast).
	{/snippet}
</Frame>

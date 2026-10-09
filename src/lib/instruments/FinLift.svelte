<!--
	Fin lift and angle of attack (fins chapter), from the numbers the chapter
	reports: a quad with the rear fins stock peaks at C_L = 0.87 near 30 deg,
	shifted inboard about 0.7 near 20 deg, with C_L rising close to linearly up
	to the peak; lift L = 1/2 rho v^2 A C_L on the 0.015 m^2 instrumented fin,
	trim near C_L 0.15 and a committed cutback near 0.6; the cavitation number
	sigma = (p_inf - p_v) / (1/2 rho v^2); and drag L / (L/D) at the best
	reported L/D of 4.4. Past the peak the chapter says only that lift
	collapses, so the drop is drawn dashed and schematic.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { axes, curve, dot, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { speed = 8 }: SwellProps & { speed?: number } = $props();
	let v = $state(8);
	let CL = $state(0.6);
	let area = $state(0.015);
	$effect.pre(() => { v = clamp(speed, 1, 14); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 340, draw);

	const RHO = 1025;

	function draw({ ctx, W, H, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const A = axes(ctx, COL, { x: 60, y: 20, w: 480, h: H - 70 }, [0, 45], [0, 1], {
			xTicks: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45],
			yTicks: [0, 0.2, 0.4, 0.6, 0.8, 1],
			xLabel: 'angle of attack [deg]',
			yLabel: 'C_L',
			xFmt: (x) => `${x}°`,
			yFmt: (y) => fmt(y, 1)
		});
		const rise = (peak: number, at: number) => (a: number) => (a <= at ? (peak * a) / at : NaN);
		const fall = (peak: number, at: number) => (a: number) => (a >= at ? peak * Math.max(0.35, 1 - (a - at) / 12) : NaN);
		curve(ctx, A, rise(0.87, 30), COL.teal, 2.2);
		curve(ctx, A, fall(0.87, 30), COL.teal, 1.4, [5, 4]);
		curve(ctx, A, rise(0.7, 20), COL.gold, 1.8);
		curve(ctx, A, fall(0.7, 20), COL.gold, 1.2, [5, 4]);
		label(ctx, COL, 'quad, rear fins stock: 0.87 at 30°', A.X(29), A.Y(0.87) - 8, COL.teal, 'right');
		label(ctx, COL, 'rear fins inboard: ~0.7 at 20°', A.X(19), A.Y(0.7) - 8, COL.gold, 'right');
		label(ctx, COL, 'dashed: "lift collapses", shape not given', A.X(44), A.Y(0.12), COL.muted, 'right');
		ctx.fillStyle = COL.a(COL.teal, 0.08);
		ctx.fillRect(A.X(0), A.box.y, A.X(5) - A.X(0), A.box.h);
		label(ctx, COL, 'trim', A.X(2.5), A.box.y + 12, COL.muted, 'center', 9);
		dot(ctx, A.X((CL / 0.87) * 30), A.Y(CL), 5, COL.accent);

		// right: lift on the fin against speed, for the chosen C_L
		const B = axes(ctx, COL, { x: 610, y: 20, w: W - 640, h: H - 70 }, [0, 14], [0, 800], {
			xTicks: [0, 4, 8, 12],
			yTicks: [0, 200, 400, 600, 800],
			xLabel: 'speed [m/s]',
			yLabel: 'lift [N]'
		});
		curve(ctx, B, (s) => 0.5 * RHO * s * s * area * CL, COL.accent, 2);
		curve(ctx, B, (s) => 0.5 * RHO * s * s * area * 0.15, COL.a(COL.teal, 0.6), 1.2, [4, 4]);
		dot(ctx, B.X(v), B.Y(0.5 * RHO * v * v * area * CL), 5, COL.accent);

		const q = 0.5 * RHO * v * v;
		const L = q * area * CL;
		const pInf = 101.3e3 + RHO * G * 0.3;
		const sigma = (pInf - 2.3e3) / q;
		readout =
			`at ${fmt(v, 1)} m/s, ½ρv² = <b>${fmt(q / 1000, 1)} kPa</b> · L = ½ρv²AC<sub>L</sub> on ${fmt(area * 1e4, 0)} cm² at C<sub>L</sub> ${fmt(CL, 2)} = <b>${fmt(L, 0)} N</b> (${fmt(L / G, 0)} kgf); trim at 0.15 gives ${fmt(q * area * 0.15, 0)} N` +
			` · at the best reported L/D of 4.4 that costs <b>${fmt(L / 4.4, 0)} N</b> of drag, <b>${fmt((L / 4.4) * v, 0)} W</b>` +
			` · cavitation number σ at 0.3 m = <b>${fmt(sigma, 1)}</b>: ${sigma > 1.5 ? 'far from boiling; a fin that lets go has stalled or ventilated' : 'approaching cavitation'}`;
	}
</script>

<Frame title="Fins: lift against angle of attack" W={880} H={340} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="speed v" bind:value={v} min={1} max={14} step={0.1} display="{fmt(v, 1)} m/s" />
		<Slider label="lift coefficient C_L" bind:value={CL} min={0.05} max={0.87} step={0.01} display={fmt(CL, 2)} />
		<Slider label="fin area" bind:value={area} min={0.008} max={0.03} step={0.001} display="{fmt(area * 1e4, 0)} cm²" />
	{/snippet}
	{#snippet caption()}
		C<sub>L</sub> climbs close to linearly with angle of attack until the flow separates. Trim sits well under 5°;
		stall is a cutback event. Hold at a given angle falls with the square of speed, so a slow, fat section leaves the
		fins little to work with. Right: lift against speed at your C<sub>L</sub> (solid) and at trim (dashed).
	{/snippet}
</Frame>

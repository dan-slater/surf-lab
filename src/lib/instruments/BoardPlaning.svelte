<!--
	The board's two regimes (board chapter, sections 1 and 2; catching chapter,
	section 4), from the chapter's key equations: displacement hull speed
	1.34 sqrt(L_wl) knots (L in feet), the planing threshold F_n = U / sqrt(gL)
	about 1.5, the wetted area a fixed load needs, A = W / (1/2 rho U^2 C_L),
	drag D = W tan(tau) + 1/2 rho U^2 A C_f, and the trim condition
	L / D = cot(alpha) for a line of slope alpha.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { axes, curve, hline, label, vline } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { weight = 800, lengthFt = 6 }: SwellProps & { weight?: number; lengthFt?: number } = $props();
	let Wn = $state(800);
	let Lft = $state(6);
	let CL = $state(0.1);
	let tau = $state(6);
	let line = $state(10);
	$effect.pre(() => { Wn = clamp(weight, 400, 1200); });
	$effect.pre(() => { Lft = clamp(lengthFt, 5, 10); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, 880, 360, draw);

	const RHO = 1025, CF = 0.003, KN = 0.5144;

	function draw({ ctx, W, H, col: COL }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const q = (U: number) => 0.5 * RHO * U * U;
		const area = (U: number) => Wn / (q(U) * CL);
		const Lm = Lft * 0.3048;
		const hull = 1.34 * Math.sqrt(Lft) * KN;
		const plane = 1.5 * Math.sqrt(G * Lm);
		const A = axes(ctx, COL, { x: 60, y: 22, w: W - 110, h: H - 74 }, [0, 10], [0, 2], {
			xTicks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			yTicks: [0, 0.5, 1, 1.5, 2],
			xLabel: 'speed U [m/s]',
			yLabel: 'wetted area [m²]'
		});
		// regimes
		ctx.fillStyle = COL.a(COL.gold, 0.07);
		ctx.fillRect(A.X(0), A.box.y, A.X(hull) - A.X(0), A.box.h);
		label(ctx, COL, 'paddling: displacement', A.X(hull / 2), A.box.y + 14, COL.gold, 'center', 9.5);
		vline(ctx, A, hull, COL.gold, [2, 3]);
		label(ctx, COL, `hull speed ${fmt(hull, 1)} m/s`, A.X(hull) + 4, A.box.y + 30, COL.gold);
		vline(ctx, A, plane, COL.a(COL.teal, 0.7));
		label(ctx, COL, `Fn = 1.5 on full length: ${fmt(plane, 1)} m/s`, A.X(plane) + 4, A.box.y + 46, COL.teal);
		hline(ctx, A, 0.6, COL.a(COL.foam, 0.5), [6, 4]);
		label(ctx, COL, '6 ft board planform ≈ 0.6 m²', A.X(9.9), A.Y(0.6) - 5, COL.muted, 'right');
		curve(ctx, A, area, COL.accent, 2.2, [], [1, 10]);
		label(ctx, COL, `area a ${fmt(Wn, 0)} N load needs at C_L = ${fmt(CL, 2)}`, A.X(9.9), A.Y(area(9.5)) - 8, COL.accent, 'right');

		const D = (U: number) => Wn * Math.tan((tau * Math.PI) / 180) + q(U) * area(U) * CF;
		const LD = 1 / Math.tan((line * Math.PI) / 180);
		readout =
			`${fmt(Lft, 1)} ft board: hull speed 1.34√L = <b>${fmt(1.34 * Math.sqrt(Lft), 1)} kn</b> (${fmt(hull, 2)} m/s) · paddling at 1.7 m/s is F<sub>n</sub>=<b>${fmt(1.7 / Math.sqrt(G * Lm), 2)}</b>, riding at 8 m/s F<sub>n</sub>=<b>${fmt(8 / Math.sqrt(G * Lm), 1)}</b>` +
			`<br>wetted area at 8 m/s <b>${fmt(area(8), 2)} m²</b>, at 4 m/s <b>${fmt(area(4), 2)} m²</b> · drag W tanτ + ½ρU²AC<sub>f</sub> = <b>${fmt(D(8), 0)} N</b> at 8 m/s and <b>${fmt(D(5), 0)} N</b> at 5 m/s: roughly speed independent` +
			` · a ${fmt(line, 0)}° line needs L/D = cot α = <b>${fmt(LD, 1)}</b>`;
	}
</script>

<Frame title="The board: paddling and planing" W={880} H={360} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="board length" bind:value={Lft} min={5} max={10} step={0.5} display="{fmt(Lft, 1)} ft" />
		<Slider label="load W" bind:value={Wn} min={400} max={1200} step={10} display="{fmt(Wn, 0)} N" />
		<Slider label="lift coefficient C_L" bind:value={CL} min={0.05} max={0.4} step={0.01} display={fmt(CL, 2)} />
		<Slider label="trim angle τ" bind:value={tau} min={2} max={12} display="{fmt(tau, 0)}°" />
		<Slider label="slope of your line α" bind:value={line} min={5} max={40} display="{fmt(line, 0)}°" />
	{/snippet}
	{#snippet caption()}
		While you paddle the board is a displacement hull, capped near 1.34√L knots. Once planing, the load is fixed at what
		you weigh, so going faster does not make more lift, it wets less: the area needed falls as 1/U². Below about 5 m/s
		a small board runs out of bottom. Skin friction is taken at C<sub>f</sub> = 0.003.
	{/snippet}
</Frame>

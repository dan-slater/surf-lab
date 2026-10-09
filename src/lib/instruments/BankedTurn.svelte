<!--
	A banked turn (turns chapter), from the chapter's key equations:
	R = v^2 / (g tan theta) and N / Mg = 1 / cos theta; the wave a turn spends,
	s = R phi and t = R phi / v; the pump stroke W = M g dh / cos theta; and the
	reversal of a top turn, |dv| = sqrt(v1^2 + v2^2 - 2 v1 v2 cos phi) with
	mean force M |dv| / dt.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { arrow, label } from './plot';
	import { useStage } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { speed = 8, lean: lean0 = 60, turn = 90, mass = 80 }: SwellProps & { speed?: number; lean?: number; turn?: number; mass?: number } = $props();
	let v = $state(8);
	let lean = $state(60);
	let phi = $state(90);
	let M = $state(80);
	let vExit = $state(6);
	$effect.pre(() => { v = clamp(speed, 2, 14); });
	$effect.pre(() => { lean = clamp(lean0, 10, 75); });
	$effect.pre(() => { phi = clamp(turn, 10, 180); });
	$effect.pre(() => { M = clamp(mass, 40, 130); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	// narrow: the plan view sits above the rear view; the plan keeps one scale bar
	useStage(() => canvas, { W: 880, H: 360, narrowH: () => 460 }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const rad = (d: number) => (d * Math.PI) / 180;
		const R = (lv: number) => (v * v) / (G * Math.tan(rad(lv)));
		const ph = rad(phi);

		// plan view, to scale: arcs for this lean and for 45 degrees, from a common entry
		const ox = narrow ? 50 : 60, oy = narrow ? 236 : H - 50;
		const Rmax = Math.max(R(45), R(lean));
		// px per metre; narrow, shrink so the larger arc fits (still to scale, the bar follows)
		const pxm = narrow ? Math.min(26, (W - ox - 70) / Rmax, (oy - 40) / (Rmax * (ph > Math.PI / 2 ? 2 : 1))) : 26;
		const arc = (r: number, style: string, width: number, text: string) => {
			ctx.strokeStyle = style;
			ctx.lineWidth = width;
			ctx.beginPath();
			// enter heading +x, turning left (counter-clockwise), centre above the entry point
			for (let i = 0; i <= 60; i++) {
				const a = (ph * i) / 60;
				const x = ox + r * Math.sin(a) * pxm, y = oy - (r - r * Math.cos(a)) * pxm;
				i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
			}
			ctx.stroke();
			const xe = ox + r * Math.sin(ph) * pxm, ye = oy - (r - r * Math.cos(ph)) * pxm;
			label(ctx, COL, text, Math.min(xe + 8, narrow ? W - 96 : 440), Math.max(ye, 20), style);
		};
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, narrow ? W : 470, narrow ? oy + 50 : H);
		ctx.clip();
		arc(R(45), COL.a(COL.tealHi, 0.45), 1.2, `45°: R ${fmt(R(45), 1)} m`);
		arc(R(lean), COL.teal, 2.4, `${fmt(lean, 0)}°: R ${fmt(R(lean), 1)} m`);
		ctx.restore();
		arrow(ctx, ox - 40, oy, ox, oy, COL.muted);
		label(ctx, COL, `in at ${fmt(v, 1)} m/s`, ox - 40, oy + 16, COL.muted);
		ctx.strokeStyle = COL.muted;
		ctx.beginPath();
		ctx.moveTo(ox, oy + 30);
		ctx.lineTo(ox + 5 * pxm, oy + 30);
		ctx.stroke();
		label(ctx, COL, '5 m', ox + 2.5 * pxm, oy + 44, COL.muted, 'center');

		// rear view: board rolled at the lean, N along the body
		const cx = narrow ? W / 2 : 640, cy = narrow ? 392 : 220, half = narrow ? Math.min(140, W / 2 - 16) : 140;
		const l = rad(lean);
		ctx.strokeStyle = COL.teal;
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.moveTo(cx - half, cy + 40);
		ctx.lineTo(cx + half, cy + 40);
		ctx.stroke();
		ctx.strokeStyle = COL.accent;
		ctx.lineWidth = 5;
		ctx.beginPath();
		// deck perpendicular to the body axis: the inside rail dips under the water line
		ctx.moveTo(cx - 40 * Math.cos(l), cy + 40 + 40 * Math.sin(l));
		ctx.lineTo(cx + 40 * Math.cos(l), cy + 40 - 40 * Math.sin(l));
		ctx.stroke();
		const bodyLen = narrow ? 96 : 120;
		arrow(ctx, cx, cy + 40, cx - bodyLen * Math.sin(l), cy + 40 - bodyLen * Math.cos(l), COL.gold, 2);
		label(ctx, COL, `N = ${fmt(1 / Math.cos(l), 2)} Mg`, cx - bodyLen * Math.sin(l) - 4, cy + 30 - bodyLen * Math.cos(l), COL.gold, 'right');
		ctx.strokeStyle = COL.muted;
		ctx.setLineDash([3, 4]);
		ctx.beginPath();
		ctx.moveTo(cx, cy + 40);
		ctx.lineTo(cx, cy + 40 - bodyLen - 10);
		ctx.stroke();
		ctx.setLineDash([]);
		label(ctx, COL, `lean ${fmt(lean, 0)}°`, cx + 8, cy + 40 - bodyLen + 10, COL.muted);
		label(ctx, COL, 'REAR VIEW', narrow ? W - 8 : cx + 140, narrow ? 300 : 30, COL.muted, 'right');
		label(ctx, COL, 'PLAN VIEW, TO SCALE', narrow ? W - 8 : 440, narrow ? 16 : 30, COL.muted, 'right');

		const r = R(lean);
		const N = (M * G) / Math.cos(l);
		const work = (M * G * 0.3) / Math.cos(l);
		const dv = Math.sqrt(v * v + vExit * vExit - 2 * v * vExit * Math.cos(ph));
		const F = (M * dv) / 0.6;
		readout =
			`R = v²/(g tanθ) = <b>${fmt(r, 1)} m</b> · N/Mg = 1/cosθ = <b>${fmt(1 / Math.cos(l), 2)}</b> (${fmt(N / G, 0)} kgf for ${fmt(M, 0)} kg)` +
			` · a ${fmt(phi, 0)}° turn spends s = Rφ = <b>${fmt(r * ph, 1)} m</b> in <b>${fmt((r * ph) / v, 2)} s</b>` +
			`<br>a 0.3 m extension at the apex puts in W = Mg·Δh/cosθ = <b>${fmt(work, 0)} J</b>` +
			` · reversing ${fmt(phi, 0)}° from ${fmt(v, 1)} to ${fmt(vExit, 1)} m/s is |Δv| = <b>${fmt(dv, 1)} m/s</b>, a mean <b>${fmt(F / 1000, 2)} kN</b> over 0.6 s (${fmt(F / (M * G), 1)}× bodyweight)`;
	}
</script>

<Frame title="The banked turn" W={880} H={360} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="speed v" bind:value={v} min={2} max={14} step={0.1} display="{fmt(v, 1)} m/s" />
		<Slider label="lean θ" bind:value={lean} min={10} max={75} display="{fmt(lean, 0)}°" />
		<Slider label="turn φ" bind:value={phi} min={10} max={180} step={5} display="{fmt(phi, 0)}°" />
		<Slider label="exit speed" bind:value={vExit} min={0} max={14} step={0.1} display="{fmt(vExit, 1)} m/s" />
		<Slider label="surfer + board" bind:value={M} min={40} max={130} display="{fmt(M, 0)} kg" />
	{/snippet}
	{#snippet caption()}
		A balanced, non-skidding turn on a flat surface: speed and lean set the radius, the same lean sets how heavy you
		feel. On a moving face read it as a scaling law, not the exact arc. Leaning harder buys a tighter arc that spends
		less wave, and the apex, where you are heaviest, is where a leg extension is worth most.
	{/snippet}
</Frame>

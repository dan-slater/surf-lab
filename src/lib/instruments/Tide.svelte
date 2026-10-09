<!--
	Tide walks the break (reading-the-day chapter, section 2). The wave needs
	h_b = 1.28 H_b of water; the tide, close to sinusoidal, moves the still
	water level, so the break line moves to wherever the bed sits h_b below it,
	and the Iribarren number there uses the local slope. Profile from the
	chapter's figure brief: a 1:50 outer terrace steepening to a 1:15 step.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp, fmt, breakerHeight, breakDepth, iribarren, breakerType } from './physics';
	import { label, dot, fitLabel } from './plot';
	import { useStage, useLoop } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, range: range0 = 1.2 }: SwellProps & { range?: number } = $props();
	let H0 = $state(1.5);
	let T = $state(14);
	let range = $state(1.2);
	let hour = $state(0);
	let playing = $state(true);
	$effect.pre(() => { H0 = clamp(Math.round(Hs * 10) / 10, 0.3, 5); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 5, 22); });
	$effect.pre(() => { range = clamp(range0, 0, 4); });

	const PERIOD = 12.42; // semidiurnal tide, hours
	const STEP_DEPTH = 3.0; // the 1:15 step runs from the beach out to 3 m below mean level
	const S_IN = 1 / 15, S_OUT = 1 / 50;
	/** Bed depth below mean sea level at distance x seaward of the mean waterline. */
	const bed = (x: number) => (x * S_IN <= STEP_DEPTH ? x * S_IN : STEP_DEPTH + (x - STEP_DEPTH / S_IN) * S_OUT);
	/** Inverse: distance seaward where the bed is d below mean level. */
	const xAt = (d: number) => (d <= STEP_DEPTH ? d / S_IN : STEP_DEPTH / S_IN + (d - STEP_DEPTH) / S_OUT);

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	// the loop draws while playing; when paused, redraw on input
	const st = useStage(() => canvas, { W: 880, H: 360, narrowH: (w) => Math.max(300, w * 0.85) }, (s) => {
		if (!playing) draw(s);
	});
	let last = 0;
	useLoop(() => st.stage, (s, now) => {
		const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
		last = now;
		if (playing) hour = (hour + dt * 1.2) % PERIOD; // 1.2 tide-hours per second
		draw(s);
	});

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		ctx.fillStyle = COL.ink;
		ctx.fillRect(0, 0, W, H);
		const level = (range / 2) * Math.cos((2 * Math.PI * hour) / PERIOD); // high water at hour 0
		const Hb = breakerHeight(H0, T);
		const hb = breakDepth(Hb);
		const xb = xAt(hb - level);
		const tanHere = hb - level <= STEP_DEPTH ? S_IN : S_OUT;
		const xi = iribarren(tanHere, H0, T);

		// cross-section, offshore left, beach right; x seaward distance 0..xMax
		const xMax = 260, dTop = -3, dBot = 7;
		const left = narrow ? 8 : 40, right = W - (narrow ? 8 : 30), top = 30, bot = H - 70;
		const PX = (x: number) => right - (x / xMax) * (right - left);
		const PY = (d: number) => top + ((d - dTop) / (dBot - dTop)) * (bot - top); // d positive down
		// bed
		ctx.beginPath();
		ctx.moveTo(PX(xMax), H - 60);
		for (let x = xMax; x >= -40; x -= 2) ctx.lineTo(PX(x), PY(x >= 0 ? bed(x) : x * S_IN));
		ctx.lineTo(right, H - 60);
		ctx.closePath();
		ctx.fillStyle = COL.land;
		ctx.fill();
		// tide levels
		for (const [lv, name] of [[range / 2, 'high'], [-range / 2, 'low']] as const) {
			ctx.strokeStyle = COL.grid;
			ctx.setLineDash([4, 5]);
			ctx.beginPath();
			ctx.moveTo(left, PY(-lv));
			ctx.lineTo(right, PY(-lv));
			ctx.stroke();
			ctx.setLineDash([]);
			label(ctx, COL, `${name} tide`, left + 4, PY(-lv) - 4, COL.muted);
		}
		// water at the current level
		const shoreX = level >= 0 ? -level / S_IN : xAt(-level);
		ctx.fillStyle = COL.a(COL.teal, 0.16);
		ctx.beginPath();
		ctx.moveTo(PX(xMax), PY(-level));
		ctx.lineTo(PX(Math.max(shoreX, -40)), PY(-level));
		for (let x = Math.max(shoreX, -40); x <= xMax; x += 2) ctx.lineTo(PX(x), PY(x >= 0 ? bed(x) : x * S_IN));
		ctx.closePath();
		ctx.fill();
		// the bed line, and the slope break between terrace and step
		ctx.strokeStyle = COL.a(COL.coast, 0.7);
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		for (let x = xMax; x >= -40; x -= 2) ctx.lineTo(PX(x), PY(x >= 0 ? bed(x) : x * S_IN));
		ctx.stroke();
		dot(ctx, PX(xAt(STEP_DEPTH)), PY(STEP_DEPTH), 3, COL.gold);
		ctx.strokeStyle = COL.teal;
		ctx.lineWidth = 1.6;
		ctx.beginPath();
		ctx.moveTo(PX(xMax), PY(-level));
		ctx.lineTo(PX(Math.max(shoreX, -40)), PY(-level));
		ctx.stroke();
		// slopes
		label(ctx, COL, '1:50 terrace', PX(150), PY(bed(150)) + 16, COL.muted, 'center');
		label(ctx, COL, '1:15 step', PX(22), PY(bed(22)) + 18, COL.muted, 'center');
		// break point and the depth it needs
		ctx.strokeStyle = COL.accent;
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.moveTo(PX(xb), PY(-level));
		ctx.lineTo(PX(xb), PY(hb - level + 0));
		ctx.stroke();
		dot(ctx, PX(xb), PY(-level) - 4, 5, COL.accent);
		fitLabel(ctx, COL, `h_b = ${fmt(hb, 1)} m`, PX(xb) + 4, PY(-level / 2 + hb / 2), COL.accent, right);
		label(ctx, COL, `${breakerType(xi)}`, PX(xb), PY(-level) - 14, COL.accent, 'center');
		// tide clock
		const cx = narrow ? 26 : 70, cy = H - 30, r = 16;
		ctx.strokeStyle = COL.muted;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, 7);
		ctx.stroke();
		const ang = (2 * Math.PI * hour) / PERIOD - Math.PI / 2;
		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
		ctx.stroke();
		label(ctx, COL, `${fmt(hour, 1)} h after high${narrow ? ',' : ' water,'} level ${level >= 0 ? '+' : ''}${fmt(level, 2)} m`, cx + 26, cy + 4, COL.muted);
		if (!narrow) label(ctx, COL, 'scale: 260 m across, depth ×' + fmt((bot - top) / (dBot - dTop) / ((right - left) / xMax), 0), right, H - 26, COL.muted, 'right');

		readout =
			`H₀=<b>${fmt(H0, 1)} m</b> at <b>${fmt(T, 0)} s</b> → H<sub>b</sub>=<b>${fmt(Hb, 2)} m</b>, needs h<sub>b</sub>=1.28H<sub>b</sub>=<b>${fmt(hb, 2)} m</b>` +
			` · break line <b>${fmt(xb, 0)} m</b> out on the <b>1:${tanHere === S_IN ? 15 : 50}</b> bed (it moves ${fmt(xAt(hb + range / 2) - xAt(Math.max(hb - range / 2, 0)), 0)} m over the tide)` +
			` · ξ₀=<b>${fmt(xi, 2)}</b> → <b>${breakerType(xi)}</b>`;
	}
</script>

<Frame title="Tide walks the break" W={880} H={360} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="tide range" bind:value={range} min={0} max={4} step={0.1} display="{fmt(range, 1)} m" />
		<Slider label="hours after high" bind:value={hour} min={0} max={12.4} step={0.1} display="{fmt(hour, 1)} h" />
		<Slider label="offshore H₀" bind:value={H0} min={0.3} max={5} step={0.1} display="{fmt(H0, 1)} m" />
		<button type="button" onclick={() => (playing = !playing)}>{playing ? 'pause' : 'play'}</button>
	{/snippet}
	{#snippet caption()}
		The tide does not change the wave, it changes the depth the wave meets. The break sits where the bed is h<sub>b</sub>
		below the water; as the level falls the break walks seaward onto whatever slope is there, and on a steeper piece of
		bank the same swell climbs the Iribarren scale. The tide is drawn as a pure 12.4 h sinusoid, so mid tide changes
		fastest. Depth is exaggerated.
	{/snippet}
</Frame>

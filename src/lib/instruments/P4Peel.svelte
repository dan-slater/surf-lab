<!--
	P4, peel angle and makeability, animated. Lifted from the research notes
	(demo-p4); maths and drawing unchanged, colours from tokens. The default
	celerity is the review's c_b = sqrt(2.0 g H_b) for the swell's breaker height.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp, fmt, breakerHeight, breakCelerity } from './physics';
	import { useStage, useLoop } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, peel = 40, celerity }: SwellProps & { peel?: number; celerity?: number } = $props();

	let alphaDeg = $state(40);
	let c = $state(6.5);
	$effect.pre(() => { alphaDeg = clamp(Math.round(peel), 8, 85); });
	$effect.pre(() => { c = clamp(Math.round((celerity ?? breakCelerity(breakerHeight(Hs, Tp))) * 10) / 10, 4, 11); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	const st = useStage(() => canvas, { W: 880, H: 380, narrowH: (w) => Math.max(300, w * 0.95) }, () => {});
	let t=0, last=performance.now();
	const VMAX=11;
	useLoop(() => st.stage, frame);

	function frame({ ctx, W, H, col: COL, narrow }: Stage, now: number){
		const dt=clamp((now-last)/1000,0,0.05); last=now; t+=dt;
		const alpha=alphaDeg*Math.PI/180;
		const Vp=c/Math.sin(alpha), w=c/Math.tan(alpha);
		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,H);
		// scene scale; loop time adapts so the crest sweeps the full canvas
		const S=2.6, cyc=(H-140)/(c*S);
		const tt=t%cyc;
		ctx.globalAlpha = clamp(Math.min(tt/0.6,(cyc-tt)/0.6,1),0,1);
		ctx.fillStyle=COL.land; ctx.fillRect(0,0,W,34);
		ctx.strokeStyle=COL.a(COL.coast,0.5); ctx.beginPath(); ctx.moveTo(0,34); ctx.lineTo(W,34); ctx.stroke();
		ctx.font=COL.font(10.5); ctx.fillStyle=COL.muted; ctx.fillText("SHORE", 12, 22);
		const y0=H-46, crestY=y0-c*tt*S;                 // crest advances up
		const xb0=narrow?30:90, xb=xb0+w*tt*S;                     // breakpoint moves right
		// whitewater wedge: everything left of historical breakpoints
		ctx.fillStyle=COL.a(COL.foam,0.14);
		ctx.beginPath();
		ctx.moveTo(xb, crestY);
		ctx.lineTo(xb0, y0);
		ctx.lineTo(0, y0);
		ctx.lineTo(0, crestY);
		ctx.closePath(); ctx.fill();
		// trail line (peel locus)
		ctx.strokeStyle=COL.accent; ctx.lineWidth=1.6; ctx.setLineDash([5,4]);
		ctx.beginPath(); ctx.moveTo(xb0,y0); ctx.lineTo(xb,crestY); ctx.stroke(); ctx.setLineDash([]);
		// crest line
		ctx.strokeStyle=COL.teal; ctx.lineWidth=2.4;
		ctx.beginPath(); ctx.moveTo(xb,crestY); ctx.lineTo(W-20,crestY); ctx.stroke();
		// broken part of crest
		ctx.strokeStyle=COL.a(COL.foam,0.85); ctx.lineWidth=4; ctx.lineCap="round";
		ctx.beginPath(); ctx.moveTo(Math.max(0,xb-46),crestY); ctx.lineTo(xb,crestY); ctx.stroke();
		// angle arc at breakpoint
		ctx.strokeStyle=COL.gold; ctx.lineWidth=1.3;
		ctx.beginPath(); ctx.arc(xb,crestY,34, 0, -alpha, true); ctx.stroke();
		ctx.fillStyle=COL.gold; ctx.fillText("α", xb+40*Math.cos(alpha/2)-3, crestY-40*Math.sin(alpha/2)+4);
		// surfer just ahead of foam
		const sx=xb+14, sy=crestY+5;
		ctx.fillStyle=COL.accent; ctx.beginPath(); ctx.arc(sx,sy,4,0,7); ctx.fill();
		ctx.strokeStyle=COL.a(COL.accent,0.5); ctx.beginPath(); ctx.moveTo(sx-12,sy+3); ctx.lineTo(sx+8,sy-2); ctx.stroke();
		// arrows: c (shoreward), w (alongshore)
		ctx.strokeStyle=COL.muted; ctx.fillStyle=COL.muted; ctx.lineWidth=1.2;
		ctx.beginPath(); ctx.moveTo(W-60,crestY); ctx.lineTo(W-60,crestY-34); ctx.stroke();
		ctx.fillText("c", W-56, crestY-20);
		ctx.beginPath(); ctx.moveTo(xb,crestY+16); ctx.lineTo(xb+34,crestY+16); ctx.stroke();
		ctx.fillText("w = c/tanα", xb+8, crestY+30);
		ctx.globalAlpha=1;
		ctx.lineCap="butt";
		const ok = Vp<=VMAX;
		const next = `V_p = c / sin α = <b>${fmt(Vp,1)} m/s</b> (alongshore w = <b>${fmt(w,1)} m/s</b>) vs surfer max ≈ ${VMAX} m/s → ` +
			(ok? `<span class="good">MAKEABLE</span>` : `<span class="bad">CLOSEOUT: the section runs away</span>`) +
			` &nbsp;·&nbsp; Hutt guide: beginner α≳60°, intermediate ~45–60°, expert ~30–45°, world-class &lt;30°`;
		if (next !== readout) readout = next;
	}
</script>

<Frame title="P4: peel angle and makeability" W={880} H={380} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="peel angle α" bind:value={alphaDeg} min={8} max={85} display="{fmt(alphaDeg, 0)}°" />
		<Slider label="celerity c" bind:value={c} min={4} max={11} step={0.1} display="{fmt(c, 1)} m/s" />
	{/snippet}
	{#snippet caption()}
		Top view. Teal: the unbroken crest, advancing shoreward at c. Pale wedge: whitewater. The dot is a surfer holding
		V<sub>p</sub> = c / sin α just ahead of the foam. The verdict compares V<sub>p</sub> with about 11 m/s, a generous
		cap for down-the-line speed.
	{/snippet}
</Frame>

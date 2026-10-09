<!--
	P1, dispersion and shoaling calculator. Lifted from the research notes
	(making-of-research.html, demo-p1); the maths and drawing are unchanged,
	colours come from CSS tokens.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, waveK, phaseSpeed, groupSpeed, shoalK, fmt } from './physics';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Tp = DEFAULT_SWELL.Tp, depth = 4 }: SwellProps & { depth?: number } = $props();

	let T = $state(15);
	let dSel = $state(4);
	$effect.pre(() => {
		T = clamp(Math.round(Tp * 2) / 2, 6, 20);
	});
	$effect.pre(() => {
		dSel = clamp(depth, 0.5, 60);
	});

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	// narrow: a taller plot, tighter margins; the maths is the same
	useStage(() => canvas, { W: 880, H: 330, narrowH: (w) => w * 0.78 }, draw);

	function draw({ ctx, W, H, col: COL, narrow }: Stage) {
		const ml = narrow ? 40 : 56, mr = narrow ? 34 : 56, mt = 18, mb = 40;
		const dmax=60, cmax=1.05*G*T/(2*Math.PI);
		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,H);
		const X=(d: number)=>ml+(d/dmax)*(W-ml-mr), Yc=(c: number)=>H-mb-(c/cmax)*(H-mt-mb);
		const ksMax=2.2, Yk=(k: number)=>H-mb-((k-0.8)/(ksMax-0.8))*(H-mt-mb);
		// axes+grid
		ctx.strokeStyle=COL.grid; ctx.lineWidth=1; ctx.font=COL.font(10); ctx.fillStyle=COL.muted;
		for(let d=0;d<=dmax;d+=10){ ctx.beginPath(); ctx.moveTo(X(d),mt); ctx.lineTo(X(d),H-mb); ctx.stroke(); ctx.fillText(String(d), X(d)-6, H-mb+16); }
		for(let c=0;c<=cmax;c+=5){ ctx.beginPath(); ctx.moveTo(ml,Yc(c)); ctx.lineTo(W-mr,Yc(c)); ctx.stroke(); ctx.fillText(String(c), ml-24, Yc(c)+3); }
		ctx.fillText("depth d [m]", W/2-30, H-8);
		ctx.save(); ctx.translate(narrow?10:14,H/2+34); ctx.rotate(-Math.PI/2); ctx.fillText("speed [m/s]",0,0); ctx.restore();
		ctx.save(); ctx.translate(W-12,H/2+18); ctx.rotate(-Math.PI/2); ctx.fillStyle=COL.accent; ctx.fillText("Ks [-]",0,0); ctx.restore();
		for(let k=1;k<=2;k+=0.5){ ctx.fillStyle=COL.accent; ctx.globalAlpha=.7; ctx.fillText(fmt(k,1), W-mr+8, Yk(k)+3); ctx.globalAlpha=1; }
		// curves
		function plot(fn: (d: number) => number, style: string, width: number, dash?: number[], ymap?: (v: number) => number){
			ctx.strokeStyle=style; ctx.lineWidth=width; ctx.setLineDash(dash||[]);
			ctx.beginPath();
			for(let i=0;i<=300;i++){ const d=0.3+ (dmax-0.3)*i/300; const v=fn(d);
				const x=X(d), y=(ymap||Yc)(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
			ctx.stroke(); ctx.setLineDash([]);
		}
		plot(d=>Math.sqrt(G*d), COL.a(COL.tealHi,0.5), 1.2, [5,5]);
		plot(d=>phaseSpeed(T,d), COL.teal, 2.2);
		plot(d=>groupSpeed(T,d), COL.gold, 1.6);
		plot(d=>clamp(shoalK(T,d),0.8,ksMax), COL.accent, 1.6, [], Yk);
		// marker
		const k=waveK(T,dSel), c=phaseSpeed(T,dSel), cg=groupSpeed(T,dSel), Ks=shoalK(T,dSel);
		ctx.strokeStyle=COL.a(COL.foam,0.4); ctx.setLineDash([3,4]);
		ctx.beginPath(); ctx.moveTo(X(dSel),mt); ctx.lineTo(X(dSel),H-mb); ctx.stroke(); ctx.setLineDash([]);
		readout = `at d=<b>${fmt(dSel,1)} m</b>, T=<b>${fmt(T,1)} s</b> &nbsp;→&nbsp; L=<b>${fmt(2*Math.PI/k,0)} m</b> · c=<b>${fmt(c,2)} m/s</b> · √(gd)=<b>${fmt(Math.sqrt(G*dSel),2)} m/s</b> (${fmt(100*(c/Math.sqrt(G*dSel)-1),1)}%) · c<sub>g</sub>=<b>${fmt(cg,2)} m/s</b> · Ks=<b>${fmt(Ks,3)}</b> &nbsp;|&nbsp; deep: c₀=<b>${fmt(G*T/(2*Math.PI),1)} m/s</b>, L₀=<b>${fmt(G*T*T/(2*Math.PI),0)} m</b>`;
	}
</script>

<Frame title="P1: dispersion and shoaling" W={880} H={330} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="period T" bind:value={T} min={6} max={20} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="evaluate at depth" bind:value={dSel} min={0.5} max={60} step={0.5} display="{fmt(dSel, 1)} m" />
	{/snippet}
	{#snippet caption()}
		Teal: phase speed c(d). Gold: group speed c<sub>g</sub>(d). Dashed: the shallow limit √(gd). Coral: shoaling
		factor K<sub>s</sub>(d), right axis. The wave dips slightly below its deep-water height near kd ≈ 1.2, then grows
		hard as c<sub>g</sub> falls.
	{/snippet}
</Frame>

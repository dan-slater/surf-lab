<!--
	P2, plane-beach refraction (Snell) and the break point. Lifted from the
	research notes (demo-p2); maths and drawing unchanged, colours from tokens.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, phaseSpeed, shoalK, fmt } from './physics';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, angle = 50, slope: slope0 = 0.03 }: SwellProps & { angle?: number; slope?: number } = $props();

	let th0deg = $state(50);
	let T = $state(15);
	let H0 = $state(2);
	let slope = $state(0.03);
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 6, 20); });
	$effect.pre(() => { H0 = clamp(Math.round(Hs * 10) / 10, 0.5, 4); });
	$effect.pre(() => { th0deg = clamp(Math.round(angle), 0, 70); });
	$effect.pre(() => { slope = clamp(slope0, 0.005, 0.12); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	useStage(() => canvas, { W: 880, H: 360, narrowH: (w) => w * 1.05 }, draw);

	function draw({ ctx, W, H, col: COL }: Stage) {
		const shoreY=44, deepY=H-16, d0=60;
		function depthAt(y: number){ return d0*(y-shoreY)/(deepY-shoreY); }
		function yAt(d: number){ return shoreY + d/d0*(deepY-shoreY); }
		const th0=th0deg*Math.PI/180;
		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,H);
		// beach + contours
		ctx.fillStyle=COL.land; ctx.fillRect(0,0,W,shoreY);
		ctx.strokeStyle=COL.a(COL.coast,0.5); ctx.beginPath(); ctx.moveTo(0,shoreY); ctx.lineTo(W,shoreY); ctx.stroke();
		ctx.strokeStyle=COL.grid; ctx.font=COL.font(10); ctx.fillStyle=COL.muted;
		[5,10,20,30,40,50].forEach(d=>{ const y=yAt(d); ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.fillText("−"+d+" m", W-46, y-4); });
		// breaking: H0 Ks Kr = 0.78 d  (bisection)
		const c0=G*T/(2*Math.PI), s0=Math.sin(th0)/c0;
		function Hat(d: number){ const c=phaseSpeed(T,d); const th=Math.asin(clamp(s0*c,-0.999,0.999));
			return H0*shoalK(T,d)*Math.sqrt(Math.cos(th0)/Math.cos(th)); }
		let lo=0.2, hi=40, db: number | null=null;
		if (Hat(hi) < 0.78*hi){ for(let i=0;i<60;i++){ const m=(lo+hi)/2; (Hat(m)<0.78*m)?(hi=m):(lo=m);} db=(lo+hi)/2; }
		// rays (march from deep to shore)
		ctx.lineWidth=1.6;
		const n=7;
		for(let r=0;r<n;r++){
			let x = W*(0.06+0.88*r/(n-1)) - Math.tan(th0)*(deepY-shoreY)*0.5;
			ctx.strokeStyle=COL.a(COL.teal,0.75); ctx.beginPath(); ctx.moveTo(x,deepY);
			let t=0, tickT=0;
			const ticks: [number, number, number][]=[];
			for(let y=deepY; y>shoreY+1; y-=2){
				const d=Math.max(depthAt(y),0.15), c=phaseSpeed(T,d);
				const th=Math.asin(clamp(s0*c,-0.999,0.999));
				x += Math.tan(th)*2;
				// travel time along ray: ds = dy/cos(th)
				t += (2/Math.cos(th))/c;
				if (t-tickT > 20){ tickT=t; ticks.push([x,y,th]); }
				if (db && d<=db){ ctx.lineTo(x,y); ctx.stroke();
					ctx.fillStyle=COL.accent; ctx.beginPath(); ctx.arc(x,y,3,0,7); ctx.fill();
					// whitewater stub
					ctx.strokeStyle=COL.a(COL.foam,0.5); ctx.beginPath(); ctx.moveTo(x,y);
					let xx=x, yy=y;
					for(let q=0;q<10 && yy>shoreY+2; q++){ yy-=4; xx+=Math.tan(th)*4*0.4; ctx.lineTo(xx,yy); }
					ctx.stroke();
					x=NaN; break;
				}
				ctx.lineTo(x,y);
			}
			if (!isNaN(x)) ctx.stroke();
			// crest ticks perpendicular to ray
			ctx.strokeStyle=COL.a(COL.tealHi,0.5); ctx.lineWidth=1;
			ticks.forEach(([tx,ty,th])=>{ ctx.beginPath();
				ctx.moveTo(tx-10*Math.cos(th), ty-10*Math.sin(th));
				ctx.lineTo(tx+10*Math.cos(th), ty+10*Math.sin(th)); ctx.stroke(); });
			ctx.lineWidth=1.6;
		}
		if (db){
			const y=yAt(db);
			ctx.strokeStyle=COL.accent; ctx.setLineDash([6,5]); ctx.lineWidth=1.4;
			ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
			const cb=phaseSpeed(T,db), thb=Math.asin(clamp(s0*cb,-0.999,0.999))*180/Math.PI;
			const xi = slope/Math.sqrt(H0/(G*T*T/(2*Math.PI)));
			const kind = xi<0.5?"spilling":(xi<=3.3?"plunging":"surging");
			readout = `breaks at d_b=<b>${fmt(db,2)} m</b> · H_b=<b>${fmt(0.78*db,2)} m</b> · crest angle at break θ_b=<b>${fmt(thb,1)}°</b> (from ${fmt(th0deg,0)}° offshore) · celerity c_b≈<b>${fmt(Math.sqrt(G*(db+0.78*db)),2)} m/s</b><br>Iribarren ξ₀=<b>${fmt(xi,2)}</b> → <b>${kind}</b> breaker (γ_b fixed at 0.78)`;
		} else readout = "no depth-limited breaking in domain (wave too small)";
	}
</script>

<Frame title="P2: plane-beach refraction and the break point" W={880} H={360} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="deep-water angle θ₀" bind:value={th0deg} min={0} max={70} display="{fmt(th0deg, 0)}°" />
		<Slider label="period T" bind:value={T} min={6} max={20} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="deep height H₀" bind:value={H0} min={0.5} max={4} step={0.1} display="{fmt(H0, 1)} m" />
		<Slider label="beach slope tanβ" bind:value={slope} min={0.005} max={0.12} step={0.005} display={fmt(slope, 3)} />
	{/snippet}
	{#snippet caption()}
		Plan view, beach at the top. Rays bend toward the beach normal by Snell's law, sin θ / c constant; crest ticks
		mark 20 s of travel along each ray. The coral dashed line is the breaking depth solved from H₀ K<sub>s</sub>
		K<sub>r</sub> = 0.78 d. Oblique swell breaks later, in shallower water, at an angle.
	{/snippet}
</Frame>

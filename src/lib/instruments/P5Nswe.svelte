<!--
	P5, a live 1-D finite-volume nonlinear shallow-water surf zone (HLL +
	Audusse). Lifted from the research notes (demo-p5); the solver and drawing
	are unchanged, colours from tokens. Changing height or period restarts it.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, fmt } from './physics';
	import { useStage, useLoop } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp }: SwellProps = $props();

	let H0v = $state(1.5);
	let Tv = $state(12);
	let running = $state(true);
	$effect.pre(() => { H0v = clamp(Math.round(Hs * 10) / 10, 0.4, 3); });
	$effect.pre(() => { Tv = clamp(Math.round(Tp * 2) / 2, 7, 18); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');
	const st = useStage(() => canvas, { W: 880, H: 300, narrowH: (w) => Math.max(230, w * 0.66) }, (s) => draw(s));

	const N=500, L=1500, dxm=L/N;
	const zb=new Float32Array(N), h=new Float32Array(N), hu=new Float32Array(N);
	const foam=new Float32Array(N);
	function depth(s: number){ return s<=0 ? -s*0.05 : (s<=250? s/25 : 10+(s-250)/70); } // negative s: dry beach rising 1:20
	// bed: offshore (left) depth 20 m -> 1:70 ramp -> 1:25 shelf -> beach
	for(let i=0;i<N;i++){
		const x=i*dxm;                      // x from offshore
		const sShore=L-90-x;                // distance to shoreline at x = L-90
		zb[i] = -depth(sShore);
	}
	let t=0;
	const simSpeed=4;
	function reset(){ for(let i=0;i<N;i++){ h[i]=Math.max(0,-zb[i]); hu[i]=0; foam[i]=0; } t=0; }
	function step(dt: number){
		const a=H0v/2, T=Tv, om=2*Math.PI/T;
		// left ghost: incoming linear wave on 20 m
		const d0=-zb[0], eta=a*Math.sin(om*t);
		const hL=d0+eta, uL=eta*Math.sqrt(G/d0);
		const F0=new Float32Array(N+1), F1=new Float32Array(N+1);
		for(let f=0; f<=N; f++){
			// states either side of face f
			let hl,ul,zl,hr,ur,zr;
			if(f===0){ hl=hL; ul=uL; zl=zb[0]; } else { hl=h[f-1]; ul=h[f-1]>1e-4?hu[f-1]/h[f-1]:0; zl=zb[f-1]; }
			if(f===N){ hr=h[N-1]; ur=0; zr=zb[N-1]; } else { hr=h[f]; ur=h[f]>1e-4?hu[f]/h[f]:0; zr=zb[f]; }
			// hydrostatic (Audusse) reconstruction
			const zf=Math.max(zl,zr);
			const hlr=Math.max(0, hl+zl-zf), hrr=Math.max(0, hr+zr-zf);
			const cl=Math.sqrt(G*hlr), cr=Math.sqrt(G*hrr);
			const SL=Math.min(ul-cl, ur-cr, 0), SR=Math.max(ul+cl, ur+cr, 0);
			const FL0=hlr*ul, FL1=hlr*ul*ul+0.5*G*hlr*hlr;
			const FR0=hrr*ur, FR1=hrr*ur*ur+0.5*G*hrr*hrr;
			if (SR-SL<1e-8){ F0[f]=0; F1[f]=0; }
			else { F0[f]=(SR*FL0-SL*FR0+SL*SR*(hrr-hlr))/(SR-SL);
				F1[f]=(SR*FL1-SL*FR1+SL*SR*(hrr*ur-hlr*ul))/(SR-SL); }
		}
		for(let i=0;i<N;i++){
			// bed slope source (centered, with reconstruction consistency, simple version)
			const zl=i>0?zb[i-1]:zb[0], zr=i<N-1?zb[i+1]:zb[N-1];
			const src = -G*h[i]*(zr-zl)/(2*dxm);
			h[i]  += dt*(F0[i]-F0[i+1])/dxm;
			hu[i] += dt*(F1[i]-F1[i+1])/dxm + dt*src;
			if (h[i]<1e-4){ h[i]=Math.max(h[i],0); hu[i]=0; }
			// friction (Manning-ish, mild)
			if (h[i]>1e-3){ const u=hu[i]/h[i]; hu[i]-=dt*0.003*u*Math.abs(u)/Math.max(h[i],0.05); }
		}
		// foam: mark steep faces
		for(let i=1;i<N-1;i++){
			const e1=h[i-1]+zb[i-1], e2=h[i+1]+zb[i+1];
			const sl=(e2-e1)/(2*dxm);
			if (sl<-0.05 && h[i]>0.15) foam[i]=1;
			foam[i]*=Math.exp(-dt*0.5);
		}
		t+=dt;
	}
	function cflDt(){
		let m=1e-6;
		for(let i=0;i<N;i++){ if(h[i]>1e-4){ const u=Math.abs(hu[i]/h[i])+Math.sqrt(G*h[i]); if(u>m)m=u; } }
		return 0.45*dxm/m;
	}
	function draw({ ctx, W, H: Hc, col: COL, narrow }: Stage){
		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,Hc);
		const x2px=W/N, zScale=16, sl=Hc*0.42;   // SWL line y; bed drawn compressed (×0.42)
		// bed
		ctx.beginPath(); ctx.moveTo(0,Hc);
		for(let i=0;i<N;i++) ctx.lineTo(i*x2px, sl - zb[i]*zScale*0.42);
		ctx.lineTo(W,Hc); ctx.closePath();
		ctx.fillStyle=COL.land; ctx.fill();
		// water
		ctx.beginPath();
		let started=false;
		for(let i=0;i<N;i++){ if(h[i]>1e-3){ const y=sl-(h[i]+zb[i])*zScale; started?ctx.lineTo(i*x2px,y):ctx.moveTo(i*x2px,y); started=true; } }
		ctx.strokeStyle=COL.teal; ctx.lineWidth=1.8; ctx.stroke();
		// fill under surface to bed
		ctx.lineTo(W*0.99, sl-zb[N-1]*zScale*0.42);
		for(let i=N-1;i>=0;i--) ctx.lineTo(i*x2px, sl - zb[i]*zScale*0.42);
		ctx.closePath(); ctx.fillStyle=COL.a(COL.teal,0.10); ctx.fill();
		// SWL
		ctx.strokeStyle=COL.grid; ctx.setLineDash([4,5]); ctx.beginPath(); ctx.moveTo(0,sl); ctx.lineTo(W,sl); ctx.stroke(); ctx.setLineDash([]);
		// foam
		ctx.fillStyle=COL.a(COL.foam,0.9);
		for(let i=0;i<N;i++) if(foam[i]>0.12){
			const y=sl-(h[i]+zb[i])*zScale;
			ctx.globalAlpha=foam[i]*0.9; ctx.beginPath(); ctx.arc(i*x2px, y-2, 1.6+foam[i]*1.6, 0, 7); ctx.fill();
		}
		ctx.globalAlpha=1;
		ctx.font=COL.font(10.5); ctx.fillStyle=COL.muted;
		ctx.fillText("offshore −20 m", 10, narrow ? Hc-10 : sl+120);
		ctx.fillText("beach", W-56, sl-30);
		ctx.fillText("t = "+fmt(t,0)+" s (×"+simSpeed+")", W-(narrow?110:130), 20);
	}

	// restart whenever height or period change, as the original sliders did
	$effect(() => { void H0v; void Tv; reset(); });

	let last=performance.now();
	useLoop(() => st.stage, (s, now) => {
		const wall=clamp((now-last)/1000,0,0.05); last=now;
		if (running){
			let remain=wall*simSpeed;
			let guard=0;
			while(remain>0 && guard++<200){ const dt=Math.min(cflDt(), remain); step(dt); remain-=dt; }
			draw(s);
			const next=`cells=<b>${N}</b> · dx=<b>${fmt(dxm,1)} m</b> · dt≈<b>${fmt(cflDt()*1000,0)} ms</b> (CFL 0.45) · watch bores form on the shelf: shocks are whitewater`;
			if (next !== readout) readout = next;
		}
	});
</script>

<Frame title="P5: 1-D shallow-water surf zone, live" W={880} H={300} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="offshore height H₀" bind:value={H0v} min={0.4} max={3} step={0.1} display="{fmt(H0v, 1)} m" />
		<Slider label="period T" bind:value={Tv} min={7} max={18} step={0.5} display="{fmt(Tv, 1)} s" />
		<button type="button" onclick={() => (running = !running)}>{running ? 'pause' : 'run'}</button>
	{/snippet}
	{#snippet caption()}
		Finite-volume nonlinear shallow-water equations, HLL fluxes with hydrostatic reconstruction, on a J-Bay-like
		cross-shore profile: 500 cells over 1.5 km, vertical exaggeration ×16 (bed compressed ×0.42), time ×4. Waves
		shoal on the ramp, steepen, shock into bores (foam dots) and run up the beach. The equations have no frequency
		dispersion, so they steepen a little early.
	{/snippet}
</Frame>

<!--
	P3, wave rays and crest isochrones over the real J-Bay coastline. Lifted
	from the research notes (demo-p3); maths and drawing unchanged, colours from
	tokens, coastline and sections from the spot (J-Bay by default). The domain
	and the offshore wavemaker anchor are J-Bay's; another spot passes its own.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { G, clamp, phaseSpeed, fmt } from './physics';
	import { useStage } from './use-stage.svelte';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import type { Stage } from './stage';
	import { JBAY } from '#lib/spots/jbay.ts';

	type Domain = { xm: [number, number]; ym: [number, number]; anchor: [number, number]; focus: [number, number] };
	const JBAY_DOMAIN: Domain = { xm: [-1000, 1500], ym: [-2800, 3750], anchor: [700, 400], focus: [-72.9, -2.2] };

	let {
		Tp = DEFAULT_SWELL.Tp,
		dirDeg = DEFAULT_SWELL.dirDeg,
		spot = JBAY,
		domain = JBAY_DOMAIN
	}: SwellProps & { domain?: Domain } = $props();

	let dir = $state(225);
	let T = $state(15);
	let mode = $state(2);
	$effect.pre(() => { dir = clamp(Math.round(dirDeg), 185, 255); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 8, 18); });

	let canvas = $state<HTMLCanvasElement>();
	let readout = $state('');

	// --- depth grid: distance to coast, parametric profile (rebuilt per spot) ---
	const grid = $derived.by(() => {
		const { xm, ym } = domain;
		const nx=100, ny=240;
		const dx=(xm[1]-xm[0])/nx, dy=(ym[1]-ym[0])/ny;
		const dist=new Float32Array((nx+1)*(ny+1));
		const C=spot.coast;
		// land test: point-in-polygon with west closure
		const poly = C.concat([[C[C.length-1][0]-2600, C[C.length-1][1]],[C[0][0]-2600, C[0][1]]]);
		function inLand(x: number,y: number){
			let inside=false;
			for(let i=0,j=poly.length-1;i<poly.length;j=i++){
				const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
				if (((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
			}
			return inside;
		}
		function segDist(px: number,py: number,ax: number,ay: number,bx: number,by: number){
			const vx=bx-ax, vy=by-ay, wx=px-ax, wy=py-ay;
			const t=clamp((wx*vx+wy*vy)/(vx*vx+vy*vy),0,1);
			return Math.hypot(px-(ax+vx*t), py-(ay+vy*t));
		}
		for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++){
			const x=xm[0]+i*dx, y=ym[0]+j*dy;
			let m=1e9;
			for(let q=0;q<C.length-1;q++){ const d=segDist(x,y,C[q][0],C[q][1],C[q+1][0],C[q+1][1]); if(d<m)m=d; }
			dist[j*(nx+1)+i] = inLand(x,y) ? -m : m;
		}
		return { nx, ny, dx, dy, dist };
	});

	useStage(() => canvas, { W: 880, H: 700, narrowH: (w) => w * 1.55 }, schedule);
	let raf = 0;
	function schedule(s: Stage) {
		// read the reactive inputs here so the stage effect tracks them
		const args = { dirFrom: dir, T, mode, g: grid, C: spot.coast, sections: spot.sections, dom: domain };
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => draw(s, args));
	}
	$effect(() => () => cancelAnimationFrame(raf));

	function draw({ ctx, W, H, col: COL, narrow }: Stage, a: { dirFrom: number; T: number; mode: number; g: typeof grid; C: [number, number][]; sections: { name: string; x: number; y: number }[]; dom: Domain }) {
		const { dirFrom, T, mode, C } = a;
		const { xm, ym } = a.dom;
		const { nx, ny, dx, dy, dist } = a.g;
		// domain (metres)
		const s = Math.min(W*0.7/(xm[1]-xm[0]), H/(ym[1]-ym[0]));
		const ox = (narrow ? W*0.17 : 170) - xm[0]*s, oy = H - 10 + ym[0]*s;
		const P=(x: number,y: number): [number, number]=>[ox+x*s, oy-y*s];
		function depthOf(sd: number){ return sd<=0 ? 0 : (sd<=250 ? sd/25 : 10+(sd-250)/70); }
		function sampleDist(x: number,y: number){
			const fi=clamp((x-xm[0])/dx,0,nx-0.001), fj=clamp((y-ym[0])/dy,0,ny-0.001);
			const i=Math.floor(fi), j=Math.floor(fj), u=fi-i, v=fj-j, n1=nx+1;
			return dist[j*n1+i]*(1-u)*(1-v)+dist[j*n1+i+1]*u*(1-v)+dist[(j+1)*n1+i]*(1-u)*v+dist[(j+1)*n1+i+1]*u*v;
		}
		// c(x,y) via lookup over depth (depends on T)
		const cTab=new Float32Array(600); for(let i=0;i<600;i++){ const d=0.3+i*0.1; cTab[i]=phaseSpeed(T,d);}
		function cAt(x: number,y: number){ const d=depthOf(sampleDist(x,y)); if(d<=0.3) return Math.sqrt(G*Math.max(d,0.05));
			const i=clamp(Math.round((d-0.3)/0.1),0,599); return cTab[i]; }

		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,H);

		// land
		ctx.beginPath();
		C.forEach((p,i)=>{ const q=P(p[0],p[1]); i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]); });
		const qa=P(C[C.length-1][0]-2600, C[C.length-1][1]), qb=P(C[0][0]-2600, C[0][1]);
		ctx.lineTo(qa[0],qa[1]); ctx.lineTo(qb[0],qb[1]); ctx.closePath();
		ctx.fillStyle=COL.land; ctx.fill(); ctx.strokeStyle=COL.a(COL.coast,0.5); ctx.lineWidth=1.4; ctx.stroke();

		// rays
		const travel=(dirFrom+180)%360, phi0=(90-travel)*Math.PI/180;
		const nR=64, ds=10, maxSteps=1800, isoEvery=25;
		const c0deep=G*T/(2*Math.PI);
		// wavemaker line anchored offshore of the point so no ray spawns behind land
		const [ax, ay]=a.dom.anchor;
		const bx=ax-Math.cos(phi0)*4600, by=ay-Math.sin(phi0)*4600;
		const px=-Math.sin(phi0), py=Math.cos(phi0);
		type Pt = { x: number; y: number; t: number; end?: boolean };
		const rays: Pt[][]=[];
		const focus= {x:0,y:0,n:0,total:0};
		const [fx, fy]=a.dom.focus;
		for(let r=0;r<nR;r++){
			const off=(r/(nR-1)-0.5)*11000;
			let x=bx+px*off, y=by+py*off, phi=phi0, t=0, entered=false, dead=false;
			const pts: Pt[]=[];
			for(let step=0; step<maxSteps; step++){
				const inside = x>xm[0]&&x<xm[1]&&y>ym[0]&&y<ym[1];
				if (inside){
					const sd=sampleDist(x,y);
					const d=depthOf(Math.max(sd,0));
					if (!entered && d<1.5){ dead=true; break; }   // spawned into land: discard
					entered=true;
					if (d<1.5){ pts.push({x,y,t,end:true}); break; }
					const c=cAt(x,y), h=25;
					const dcdx=(cAt(x+h,y)-cAt(x-h,y))/(2*h), dcdy=(cAt(x,y+h)-cAt(x,y-h))/(2*h);
					phi += ds*(Math.sin(phi)*dcdx - Math.cos(phi)*dcdy)/c;
					t += ds/c;
					pts.push({x,y,t});
				} else {
					if (entered) break;      // left the domain
					t += ds/c0deep;          // still offshore of the domain
				}
				x+=Math.cos(phi)*ds; y+=Math.sin(phi)*ds;
			}
			rays.push(dead? [] : pts);
			const last=pts[pts.length-1];
			if(!dead&&last&&last.end&&Math.hypot(last.x-(fx),last.y-(fy))<400){ focus.n++; }
			if(!dead&&last&&last.end) focus.total=(focus.total||0)+1;
		}
		if (mode!==1){
			ctx.strokeStyle=COL.a(COL.teal,0.22); ctx.lineWidth=1;
			rays.forEach(pts=>{ if(pts.length<2)return; ctx.beginPath();
				pts.forEach((p,i)=>{ const q=P(p.x,p.y); i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]); }); ctx.stroke(); });
		}
		// termination dots
		ctx.fillStyle=COL.accent;
		rays.forEach(pts=>{ const l=pts[pts.length-1]; if(l&&l.end){ const q=P(l.x,l.y); ctx.beginPath(); ctx.arc(q[0],q[1],2.2,0,7); ctx.fill(); }});
		// isochrone crests
		if (mode!==0){
			const t0=Math.min(...rays.filter(r=>r.length).map(r=>r[0].t));
			const tMax=Math.max(...rays.filter(r=>r.length).map(r=>r[r.length-1].t));
			ctx.lineWidth=1.8;
			for(let tt=t0+isoEvery; tt<tMax; tt+=isoEvery){
				ctx.strokeStyle=COL.a(COL.tealHi,0.55);
				ctx.beginPath(); let pen=false, prev: {x:number;y:number}|null=null;
				rays.forEach(pts=>{
					// find bracketing samples
					let pos: {x:number;y:number}|null=null;
					for(let i=1;i<pts.length;i++){
						if(pts[i-1].t<=tt && pts[i].t>=tt){
							const u=(tt-pts[i-1].t)/(pts[i].t-pts[i-1].t||1e-9);
							pos={x:pts[i-1].x+u*(pts[i].x-pts[i-1].x), y:pts[i-1].y+u*(pts[i].y-pts[i-1].y)};
							break;
						}
					}
					if(pos && (!prev || Math.hypot(pos.x-prev.x,pos.y-prev.y)<700)){
						const q=P(pos.x,pos.y); pen?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]); pen=true; prev=pos;
					} else { pen=false; prev=pos; }
				});
				ctx.stroke();
			}
		}
		// sections
		ctx.font=COL.font(narrow ? 9 : 10.5);
		a.sections.forEach(sec=>{
			const q=P(sec.x,sec.y);
			ctx.fillStyle=COL.gold; ctx.beginPath(); ctx.arc(q[0],q[1],2.5,0,7); ctx.fill();
			ctx.fillStyle=sec.name==="Supertubes"?COL.foam:COL.muted;
			ctx.fillText(narrow ? sec.name : sec.name.toUpperCase(), q[0]+(narrow?6:10), q[1]+3);
		});
		const c30=phaseSpeed(T,30), c10=phaseSpeed(T,10), c3=phaseSpeed(T,3);
		const share = focus.total? focus.n/focus.total : 0;
		readout = `c(30 m)=<b>${fmt(c30,1)}</b> · c(10 m)=<b>${fmt(c10,1)}</b> · c(3 m)=<b>${fmt(c3,1)} m/s</b>, the gradient that bends the rays.` +
			(focus.total? ` &nbsp;Landings within 400 m of Supers: <b>${focus.n}</b> of ${focus.total} (${fmt(100*share,0)}% onto about 13% of the coast: <span class="good">focusing</span>).`:"");
	}
</script>

<Frame title="P3: wave rays and crests over the real coastline" W={880} H={700} bind:canvas {readout}>
	{#snippet controls()}
		<Slider label="swell from" bind:value={dir} min={185} max={255} display="{fmt(dir, 0)}°" />
		<Slider label="period T" bind:value={T} min={8} max={18} step={0.5} display="{fmt(T, 1)} s" />
		<Slider label="show" bind:value={mode} min={0} max={2} display={['rays', 'crests', 'rays + crests'][mode]} />
	{/snippet}
	{#snippet caption()}
		{spot.name}, north up. Faint lines: wave rays, which curve toward slow (shallow) water. Teal lines: crest
		isochrones every 25 s of travel. Rays stop at the 1.5 m contour (coral dots, roughly the whitewater line). Depth is
		the two-slope model from distance to the coast (1:25 shelf to 250 m, then 1:70), not a survey. Coastline ©
		OpenStreetMap contributors (ODbL).
	{/snippet}
</Frame>

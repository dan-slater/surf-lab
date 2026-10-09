<!--
	P6, the surfer pose rig: forward kinematics for the upper body, two-bone IK
	for the legs, interpolated through six key poses. Lifted from the research
	notes (demo-p6); rig and drawing unchanged, colours from tokens. With
	`onPeel` the big rig rides a face drawn ahead of a peeling whitewater line
	instead of the plain wave suggestion.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp } from './physics';
	import { useStage, useLoop } from './use-stage.svelte';
	import type { SwellProps } from './types';
	import type { Stage } from './stage';

	let { pose: pose0 = 2, play = false, onPeel = false }: SwellProps & { pose?: number; play?: boolean; onPeel?: boolean } = $props();

	let poseU = $state(2);
	let playing = $state(false);
	$effect.pre(() => { poseU = clamp(pose0, 0, 5); });
	$effect.pre(() => { playing = play; });

	let canvas = $state<HTMLCanvasElement>();
	const st = useStage(() => canvas, 880, 360, () => {});

	const names=["paddle","pop-up","trim","bottom turn","top turn","tube"];
	// pose params: hips {x,y} rel board centre; torso angle (deg from vertical, +forward);
	// feet on board (x along board); arms: shoulder & elbow angles (deg, from torso down);
	// boardPitch deg. Units ~ "surfer scale" (torso 34, thigh 26, shin 24, arm 18+16).
	// arm convention: sh = swing from "hanging along torso", positive = toward nose (+x);
	// el = elbow flex, positive = forearm swings forward
	type XY = { x: number; y: number };
	type Arm = { sh: number; el: number };
	type Pose = { hips: XY; torso: number; head: number; footF: XY; footB: XY; armF: Arm; armB: Arm; pitch: number; prone?: boolean };
	const POSES: Pose[] = [
		// paddle: prone
		{ hips:{x:-14,y:7}, torso:82, head:-42, footF:{x:-34,y:5}, footB:{x:-46,y:5},
			armF:{sh:120, el:20}, armB:{sh:60, el:40}, pitch:0, prone:true },
		// pop-up: crouched low, hands pushing off the board
		{ hips:{x:-8,y:26}, torso:38, head:-14, footF:{x:14,y:0}, footB:{x:-22,y:0},
			armF:{sh:50, el:80}, armB:{sh:40, el:95}, pitch:-2 },
		// trim: relaxed, arms out for balance
		{ hips:{x:-4,y:44}, torso:12, head:0, footF:{x:16,y:0}, footB:{x:-20,y:0},
			armF:{sh:70, el:25}, armB:{sh:-50, el:30}, pitch:-1 },
		// bottom turn: deep crouch, lean forward
		{ hips:{x:-10,y:30}, torso:34, head:-8, footF:{x:16,y:0}, footB:{x:-20,y:0},
			armF:{sh:55, el:10}, armB:{sh:-55, el:15}, pitch:-8 },
		// top turn: tall, rotated, arms thrown
		{ hips:{x:0,y:50}, torso:-14, head:6, footF:{x:15,y:0}, footB:{x:-21,y:0},
			armF:{sh:150, el:10}, armB:{sh:-75, el:30}, pitch:10 },
		// tube: very low, front arm reaching out
		{ hips:{x:-12,y:24}, torso:26, head:-4, footF:{x:17,y:0}, footB:{x:-19,y:0},
			armF:{sh:95, el:5}, armB:{sh:-10, el:80}, pitch:-3 },
	];
	const SEG={torso:34, thigh:26, shin:24, armU:18, armL:16, head:6.5, board:64};
	function lerp(a: number,b: number,u: number){ return a+(b-a)*u; }
	function lerpPose(a: Pose,b: Pose,u: number): Pose{
		u=(1-Math.cos(Math.PI*u))/2;
		const o = {} as Pose;
		o.hips={x:lerp(a.hips.x,b.hips.x,u), y:lerp(a.hips.y,b.hips.y,u)};
		(["torso","head","pitch"] as const).forEach(k=>o[k]=lerp(a[k],b[k],u));
		o.footF={x:lerp(a.footF.x,b.footF.x,u), y:lerp(a.footF.y,b.footF.y,u)};
		o.footB={x:lerp(a.footB.x,b.footB.x,u), y:lerp(a.footB.y,b.footB.y,u)};
		o.armF={sh:lerp(a.armF.sh,b.armF.sh,u), el:lerp(a.armF.el,b.armF.el,u)};
		o.armB={sh:lerp(a.armB.sh,b.armB.sh,u), el:lerp(a.armB.el,b.armB.el,u)};
		o.prone = u<0.5 ? a.prone : b.prone;
		return o;
	}
	// two-bone IK: root->target, lengths l1,l2, bend sign
	function ik(rx: number,ry: number,tx: number,ty: number,l1: number,l2: number,bend: number): [number, number]{
		let dx=tx-rx, dy=ty-ry, d=Math.hypot(dx,dy);
		d=clamp(d, Math.abs(l1-l2)+0.01, l1+l2-0.01);
		const a1=Math.acos(clamp((d*d+l1*l1-l2*l2)/(2*d*l1),-1,1));
		const base=Math.atan2(dy,dx);
		const ang=base+bend*a1;
		return [rx+l1*Math.cos(ang), ry+l1*Math.sin(ang)];
	}
	function drawSurfer({ ctx, col: COL }: Stage, pose: Pose, x0: number, y0: number, scale: number, armPhase: number | null, lw: number){
		// local: x = direction of travel (right), y up. screen y flipped.
		const S=scale;
		const px=(x: number,y: number): [number, number]=>[x0+x*S, y0-y*S];
		ctx.lineCap="round"; ctx.lineJoin="round";
		// board
		const bp=pose.pitch*Math.PI/180;
		const bx=Math.cos(bp)*SEG.board/2, by=Math.sin(bp)*SEG.board/2;
		ctx.strokeStyle=COL.accent; ctx.lineWidth=lw*1.5;
		ctx.beginPath(); ctx.moveTo(...px(-bx,-by)); ctx.lineTo(...px(bx,by)); ctx.stroke();
		ctx.strokeStyle=COL.foam; ctx.lineWidth=lw;
		const hip=[pose.hips.x, pose.hips.y];
		const tA=(90-pose.torso)*Math.PI/180;   // torso angle from +x axis
		const chest=[hip[0]+SEG.torso*Math.cos(tA), hip[1]+SEG.torso*Math.sin(tA)];
		const hA=(90-pose.torso-pose.head)*Math.PI/180;
		const headC=[chest[0]+(SEG.head+4)*Math.cos(hA), chest[1]+(SEG.head+4)*Math.sin(hA)];
		// legs via IK (knees bend forward = +x)
		if (pose.prone){
			// straight legs back along board
			ctx.beginPath(); ctx.moveTo(...px(hip[0],hip[1]));
			ctx.lineTo(...px(pose.footB.x, pose.footB.y)); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(...px(hip[0],hip[1]));
			ctx.lineTo(...px(pose.footF.x, pose.footF.y+1.5)); ctx.stroke();
		} else {
			(["footF","footB"] as const).forEach(f=>{
				const foot=[pose[f].x, pose[f].y+2];
				const knee=ik(hip[0],hip[1],foot[0],foot[1],SEG.thigh,SEG.shin,1); // knees bend toward the nose
				ctx.beginPath(); ctx.moveTo(...px(hip[0],hip[1])); ctx.lineTo(...px(knee[0],knee[1])); ctx.lineTo(...px(foot[0],foot[1])); ctx.stroke();
			});
		}
		// torso
		ctx.beginPath(); ctx.moveTo(...px(hip[0],hip[1])); ctx.lineTo(...px(chest[0],chest[1])); ctx.stroke();
		// arms FK from chest; sh=0 hangs along the torso, +sh swings toward the nose
		([["armF",1],["armB",0.8]] as const).forEach(([a,alpha],idx)=>{
			let sh=pose[a].sh, el=pose[a].el;
			if (pose.prone && armPhase!==null){
				const ph=armPhase + (idx?Math.PI:0);
				sh = 100 + Math.sin(ph)*65; el = 30 + Math.cos(ph)*25;
			}
			const hang = tA + Math.PI;                        // straight down along torso
			const aA = hang + sh*Math.PI/180;                 // +sh rotates toward +x (nose)
			const elb=[chest[0]+SEG.armU*Math.cos(aA), chest[1]+SEG.armU*Math.sin(aA)];
			const wA = aA + el*Math.PI/180;
			const hand=[elb[0]+SEG.armL*Math.cos(wA), elb[1]+SEG.armL*Math.sin(wA)];
			ctx.globalAlpha=alpha;
			ctx.beginPath(); ctx.moveTo(...px(chest[0],chest[1])); ctx.lineTo(...px(elb[0],elb[1])); ctx.lineTo(...px(hand[0],hand[1])); ctx.stroke();
			ctx.globalAlpha=1;
		});
		// head
		ctx.beginPath(); ctx.arc(...px(headC[0],headC[1]), SEG.head*S, 0, 7); ctx.stroke();
	}

	let t=0, last=performance.now();
	let label = $state('trim');
	useLoop(() => st.stage, (s, now) => {
		const { ctx, W, H, col: COL } = s;
		const dt=clamp((now-last)/1000,0,0.05); last=now;
		if (playing){ t+=dt*0.55; poseU=+((t)%5.999).toFixed(3); }
		const u=poseU;
		const i=clamp(Math.floor(u),0,4), f=clamp(u-i,0,1);
		const pose=lerpPose(POSES[i], POSES[Math.min(i+1,5)], f);
		const next = f<0.15? names[i] : (f>0.85? names[Math.min(i+1,5)] : names[i]+" → "+names[Math.min(i+1,5)]);
		if (next !== label) label = next;
		ctx.fillStyle=COL.ink; ctx.fillRect(0,0,W,H);
		if (onPeel){
			// the peel front: unbroken face ahead (right), whitewater trailing behind (left)
			ctx.fillStyle=COL.a(COL.foam,0.12);
			ctx.beginPath(); ctx.moveTo(0,150); ctx.lineTo(214,170); ctx.lineTo(150,300); ctx.lineTo(0,300); ctx.closePath(); ctx.fill();
			ctx.strokeStyle=COL.a(COL.foam,0.6); ctx.lineWidth=2; ctx.setLineDash([5,4]);
			ctx.beginPath(); ctx.moveTo(150,300); ctx.lineTo(214,170); ctx.stroke(); ctx.setLineDash([]);
			ctx.font=COL.font(10); ctx.fillStyle=COL.muted;
			ctx.fillText("WHITEWATER", 24, 230); ctx.fillText("UNBROKEN FACE", 400, 170);
		}
		// wave face suggestion behind big rig
		ctx.strokeStyle=COL.a(COL.teal,0.35); ctx.lineWidth=2;
		ctx.beginPath();
		for(let x=0;x<=W*0.62;x+=8){ const y=252 - 66*Math.exp(-Math.pow((x-238)/150,2)); x?ctx.lineTo(x,y):ctx.moveTo(x,y); }
		ctx.stroke();
		drawSurfer(s, pose, 300, 236, 1.35, pose.prone?t*6:null, 3);
		// LOD strip: all key poses tiny
		ctx.font=COL.font(10);
		ctx.fillStyle=COL.muted; ctx.fillText("AT BACKGROUND SCALE:", 560, 96);
		for(let k=0;k<6;k++){
			drawSurfer(s, POSES[k], 575+k*48, 150, 0.28, POSES[k].prone?t*6:null, 1.2);
			ctx.fillStyle=COL.muted;
		}
	});
</script>

<Frame title="P6: surfer pose rig" W={880} H={360} bind:canvas>
	{#snippet controls()}
		<Slider label="pose" bind:value={poseU} min={0} max={5} step={0.01} display={label} />
		<button type="button" onclick={() => (playing = !playing)}>{playing ? 'pause' : 'play'}</button>
	{/snippet}
	{#snippet caption()}
		A ten-bone side-view rig on a board: forward kinematics for the upper body, two-bone inverse kinematics for the
		legs with the feet pinned to the board, eased between six key poses (paddle, pop-up, trim, bottom turn, top turn,
		tube). The strip on the right is the same skeleton at the size the simulation draws it.
	{/snippet}
</Frame>

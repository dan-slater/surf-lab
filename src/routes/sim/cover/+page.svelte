<script lang="ts">
	// Dev route for the product renderer. Query: ?warm=300 (model s before the
	// first frame), ?speed=10 (model s per real s), ?dx=6.25, ?foam=0 (hide foam),
	// ?across=4300 (m across the width), ?up=90 (compass bearing up the screen),
	// ?cx=-150&cy=-300 (ENU centre), ?hud=0
	import { bathyFromPolyline } from '#lib/sim/bathy.ts';
	import { createSolver, type Solver } from '#lib/sim/solver.ts';
	import { requestDevice } from '#lib/sim/gpu.ts';
	import { createRenderer } from '#lib/sim/render/renderer.ts';
	import { viewAffine, viewToPixel } from '#lib/sim/render/view.ts';
	import { createFrontTracker } from '#lib/sim/render/fronts.ts';
	import { JBAY, JBAY_RUN_A_SWELL, jbayGrid } from '#lib/spots/jbay.ts';

	let canvas: HTMLCanvasElement;
	let overlay: HTMLCanvasElement;
	let hud = $state('starting');
	let showHud = $state(true);

	$effect(() => {
		let raf = 0;
		let alive = true;
		let solver: Solver | undefined;
		(async () => {
			const q = new URLSearchParams(location.search);
			showHud = q.get('hud') !== '0';
			const { device } = await requestDevice();
			const grid = jbayGrid(Number(q.get('dx') ?? 6.25));
			const { depth } = bathyFromPolyline(JBAY.coast, grid);
			solver = createSolver(device, {
				nx: grid.nx, ny: grid.ny, dx: grid.dx, depth, swell: JBAY_RUN_A_SWELL,
				wavemaker: { width: 75 / grid.dx }, sponge: { width: 150 / grid.dx }
			});
			const warm = Number(q.get('warm') ?? 0);
			if (warm > 0) solver.step(Math.round(warm / solver.params.dt));
			const context = canvas.getContext('webgpu') as GPUCanvasContext;
			const format = navigator.gpu.getPreferredCanvasFormat();
			context.configure({ device, format, alphaMode: 'opaque' });
			const pr = Math.min(devicePixelRatio || 1, 2);
			const view = {
				center: [Number(q.get('cx') ?? -150), Number(q.get('cy') ?? -300)] as [number, number],
				metersAcross: Number(q.get('across') ?? 4300),
				upDeg: Number(q.get('up') ?? 90)
			};
			let toPx = viewToPixel(view, innerWidth, innerHeight);
			const resize = () => {
				canvas.width = overlay.width = Math.round(innerWidth * pr);
				canvas.height = overlay.height = Math.round(innerHeight * pr);
				r.setAffine(viewAffine(grid, view, innerWidth, innerHeight), pr);
				toPx = viewToPixel(view, innerWidth, innerHeight);
			};
			const tracker = createFrontTracker(solver, grid);
			const ctx2d = overlay.getContext('2d')!;
			const showFronts = q.get('fronts') === '1';
			const r = createRenderer(solver, {
				context, format, pixelRatio: pr, affine: [1, 0, 0, 0, 1, 0],
				look: { foamOpacity: q.get('foam') === '0' ? 0 : undefined }
			});
			r.setHs(solver.swell.Hs);
			resize();
			addEventListener('resize', resize);
			const speed = Number(q.get('speed') ?? 10);
			let owed = 0, prev = performance.now(), frames = 0, lastHud = prev;
			const frame = () => {
				if (!alive || !solver) return;
				const now = performance.now();
				owed += (Math.min(now - prev, 100) / 1000) * speed;
				prev = now;
				const n = Math.floor(owed / solver.params.dt);
				owed -= n * solver.params.dt;
				if (n > 0) solver.step(n);
				r.draw(solver.time);
				tracker.update();
				const fronts = tracker.fronts();
				(window as unknown as { __fronts: unknown }).__fronts = { t: solver.time, fronts };
				ctx2d.setTransform(pr, 0, 0, pr, 0, 0);
				ctx2d.clearRect(0, 0, innerWidth, innerHeight);
				if (showFronts) {
					for (const f of fronts) {
						const [px, py] = toPx(f.x, f.y);
						const [qx, qy] = toPx(f.x + f.dir[0] * 40, f.y + f.dir[1] * 40);
						ctx2d.strokeStyle = f.peeling ? (f.makeable ? '#ff8a5c' : '#ffb454') : 'rgba(181,229,226,0.5)';
						ctx2d.lineWidth = f.peeling ? 2 : 1;
						ctx2d.beginPath();
						ctx2d.arc(px, py, f.peeling ? 5 : 3, 0, 7);
						ctx2d.moveTo(px, py);
						ctx2d.lineTo(qx, qy);
						ctx2d.stroke();
						if (f.peeling) {
							ctx2d.fillStyle = '#f2efe6';
							ctx2d.font = '10px ui-monospace, monospace';
							ctx2d.fillText(`${f.speed.toFixed(1)} m/s, Vp ${f.vp.toFixed(1)}`, px + 8, py - 6);
						}
					}
				}
				frames++;
				if (now - lastHud > 500) {
					hud = `t ${solver.time.toFixed(0)} s, ${((frames * 1000) / (now - lastHud)).toFixed(0)} fps`;
					frames = 0;
					lastHud = now;
				}
				raf = requestAnimationFrame(frame);
			};
			raf = requestAnimationFrame(frame);
		})().catch((e) => (hud = String(e)));
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			solver?.dispose();
		};
	});
</script>

<canvas bind:this={canvas}></canvas>
<canvas bind:this={overlay} class="overlay"></canvas>
{#if showHud}<p>{hud}</p>{/if}

<style>
	:global(body) { margin: 0; background: #060e17; overflow: hidden; }
	canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; }
	.overlay { pointer-events: none; }
	p { position: fixed; left: 12px; bottom: 8px; margin: 0; font: 11px ui-monospace, monospace; color: #8fa8ad; }
</style>

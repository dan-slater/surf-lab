<!--
	The 2-D shallow-water solver (src/lib/sim, owned by the sim line) running on
	J-Bay in a small canvas, painted by its debug renderer. Without WebGPU it
	shows a captured frame instead. The solver's swell direction is the LOCAL
	one at the wavemaker (Run A: from 120 deg, after the regional SW swell has
	wrapped Cape St Francis), so it takes its own `localDirDeg` rather than the
	book's regional dirDeg.
-->
<script lang="ts">
	import Frame from './Frame.svelte';
	import Slider from './Slider.svelte';
	import { clamp, fmt } from './physics';
	import { DEFAULT_SWELL, type SwellProps } from './types';
	import { bathyFromPolyline } from '#lib/sim/bathy.ts';
	import { createSolver, type Solver } from '#lib/sim/solver.ts';
	import { createDebugRenderer } from '#lib/sim/debug-render.ts';
	import { requestDevice } from '#lib/sim/gpu.ts';
	import { JBAY, JBAY_GRID, JBAY_RUN_A_SWELL } from '#lib/spots/jbay.ts';
	import fallbackFrame from './assets/sim-jbay-t390.png';

	let { Hs = DEFAULT_SWELL.Hs, Tp = DEFAULT_SWELL.Tp, localDirDeg = JBAY_RUN_A_SWELL.dirDeg, warm = 240 }: SwellProps & { localDirDeg?: number; warm?: number } = $props();

	let H = $state(2.5);
	let T = $state(15);
	$effect.pre(() => { H = clamp(Math.round(Hs * 10) / 10, 0.5, 4); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 8, 18); });

	let canvas = $state<HTMLCanvasElement>();
	let status = $state<'starting' | 'running' | 'unavailable'>('starting');
	let reason = $state('');
	let modelTime = $state(0);
	let solver: Solver | undefined;

	$effect(() => {
		const cv = canvas;
		if (!cv) return;
		let alive = true;
		let raf = 0;
		let visible = true;
		const io = new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true));
		io.observe(cv);
		let renderer: ReturnType<typeof createDebugRenderer> | undefined;
		(async () => {
			const { device } = await requestDevice();
			if (!alive) return;
			const { depth } = bathyFromPolyline(JBAY.coast, JBAY_GRID);
			cv.width = JBAY_GRID.ny * 2;
			cv.height = JBAY_GRID.nx * 2;
			solver = createSolver(device, {
				nx: JBAY_GRID.nx,
				ny: JBAY_GRID.ny,
				dx: JBAY_GRID.dx,
				depth,
				swell: { ...JBAY_RUN_A_SWELL, Hs: H, Tp: T, dirDeg: localDirDeg }
			});
			if (warm > 0) solver.step(Math.round(warm / solver.params.dt));
			renderer = createDebugRenderer(device, cv, solver);
			status = 'running';
			const frame = () => {
				if (!alive || !solver || !renderer) return;
				if (visible) {
					solver.step();
					renderer.draw();
					modelTime = solver.time;
				}
				raf = requestAnimationFrame(frame);
			};
			raf = requestAnimationFrame(frame);
		})().catch((e) => {
			reason = e instanceof Error ? e.message : String(e);
			status = 'unavailable';
		});
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			io.disconnect();
			renderer?.dispose();
			solver?.dispose();
			solver = undefined;
		};
	});

	// the dial: change the forcing without a restart
	$effect(() => {
		const swell = { ...JBAY_RUN_A_SWELL, Hs: H, Tp: T, dirDeg: localDirDeg };
		if (status === 'running') solver?.setSwell(swell);
	});

	const readout = $derived(
		status === 'running'
			? `J-Bay, ${JBAY_GRID.nx} × ${JBAY_GRID.ny} cells at ${JBAY_GRID.dx} m · model time <b>${fmt(modelTime, 0)} s</b> · swell from ${fmt(localDirDeg, 0)}° at the wavemaker`
			: status === 'starting'
				? 'starting the WebGPU solver…'
				: `WebGPU unavailable (${reason}); showing a captured frame at t = 390 s`
	);
</script>

<Frame title="The 2-D simulation on J-Bay" W={1024} H={384} {readout}>
	{#snippet figure()}
		{#if status === 'unavailable'}
			<img src={fallbackFrame} alt="A captured frame of the J-Bay simulation: surface elevation along the coast, swell entering from the bottom edge and fading before the surf zone." width="1024" height="384" />
		{:else}
			<canvas bind:this={canvas} style:aspect-ratio="1024 / 384"></canvas>
		{/if}
	{/snippet}
	{#snippet controls()}
		<Slider label="Hs" bind:value={H} min={0.5} max={4} step={0.1} display="{fmt(H, 1)} m" />
		<Slider label="Tp" bind:value={T} min={8} max={18} step={0.5} display="{fmt(T, 1)} s" />
	{/snippet}
	{#snippet caption()}
		Along-shore left to right (Kitchen Windows to Albatross), land at the top, the wavemaker along the bottom edge;
		colour is surface elevation, white is foam. This is the first-order solver: it carries the swell's refraction over
		the modelled shelf but damps a 15 s swell before the surf zone, so J-Bay does not break here yet. Bathymetry is
		modelled from the coastline, not surveyed.
	{/snippet}
</Frame>

<style>
	img,
	canvas {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--line, rgba(122, 197, 200, 0.16));
		border-radius: 4px;
		background: var(--ink, #071019);
	}
</style>

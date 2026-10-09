<!--
	The 2-D shallow-water solver (src/lib/sim, owned by the sim line) running on
	J-Bay in a small canvas, painted by its debug renderer, configured as the
	sim line's /sim route: MUSCL-MC + SSP-RK2 at 6.25 m, a 75 m wavemaker band,
	150 m sponges. It reads the deep-water dirDeg like every other instrument
	and turns it into the wavemaker's direction with the sim line's
	generatorDirection (Snell to the wavemaker depth at this Tp). Without WebGPU
	it shows a captured frame instead.
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
	import { generatorDirection } from '#lib/sim/swell.ts';
	import { wavemakerDepth } from '#lib/sim/config.ts';
	import { JBAY, JBAY_RUN_A_SWELL, jbayGrid } from '#lib/spots/jbay.ts';
	import fallbackFrame from './assets/sim-jbay-muscl.png';

	let {
		Hs = DEFAULT_SWELL.Hs,
		Tp = DEFAULT_SWELL.Tp,
		dirDeg = DEFAULT_SWELL.dirDeg,
		warm = 300,
		speed = 6
	}: SwellProps & { warm?: number; speed?: number } = $props();

	let H = $state(2.5);
	let T = $state(15);
	$effect.pre(() => { H = clamp(Math.round(Hs * 10) / 10, 0.5, 4); });
	$effect.pre(() => { T = clamp(Math.round(Tp * 2) / 2, 8, 18); });

	const grid = jbayGrid(6.25);
	const WAVEMAKER_CELLS = 75 / grid.dx;
	const { depth } = bathyFromPolyline(JBAY.coast, grid);
	const dWavemaker = wavemakerDepth(depth, grid.nx, grid.ny, WAVEMAKER_CELLS);
	const gen = $derived(generatorDirection(dirDeg, grid, dWavemaker, { Tp: T }));
	const swell = $derived({ ...JBAY_RUN_A_SWELL, Hs: H, Tp: T, dirDeg: gen.dirDeg });

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
		const start = $state.snapshot(swell);
		(async () => {
			const { device } = await requestDevice();
			if (!alive) return;
			cv.width = 1024;
			cv.height = 384;
			solver = createSolver(device, {
				nx: grid.nx,
				ny: grid.ny,
				dx: grid.dx,
				depth,
				swell: start,
				wavemaker: { width: WAVEMAKER_CELLS },
				sponge: { width: 150 / grid.dx }
			});
			if (warm > 0) solver.step(Math.round(warm / solver.params.dt));
			renderer = createDebugRenderer(solver, cv);
			status = 'running';
			// model seconds per real second, capped per frame so a slow GPU falls behind instead of stalling
			let owed = 0;
			let prev = performance.now();
			const frame = () => {
				if (!alive || !solver || !renderer) return;
				const now = performance.now();
				if (visible) {
					owed += (Math.min(now - prev, 100) / 1000) * speed;
					const n = Math.min(Math.floor(owed / solver.params.dt), 120);
					owed = Math.min(owed - n * solver.params.dt, solver.params.dt * 120);
					if (n > 0) solver.step(n);
					renderer.draw();
					modelTime = solver.time;
				}
				prev = now;
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
		const s = swell;
		if (status === 'running') solver?.setSwell(s);
	});

	const readout = $derived(
		status === 'running'
			? `J-Bay, ${grid.nx} × ${grid.ny} cells at ${grid.dx} m, MUSCL + RK2 · model time <b>${fmt(modelTime, 0)} s</b> · deep water from ${fmt(dirDeg, 0)}° → <b>${fmt(gen.dirDeg, 0)}°</b> at the wavemaker${gen.fromBehind ? ' (from behind the coast: wraps the headland)' : ''}${gen.clamped ? ', capped at 45° off the shore normal' : ''}`
			: status === 'starting'
				? 'starting the WebGPU solver…'
				: `WebGPU unavailable (${reason}); showing a captured frame`
	);
</script>

<Frame title="The 2-D simulation on J-Bay" W={1024} H={384} {readout}>
	{#snippet figure()}
		{#if status === 'unavailable'}
			<img src={fallbackFrame} alt="A captured frame of the J-Bay simulation: oblique swell crests reaching the coast, with white foam along the shoreline where they break." width="1024" height="384" />
		{:else}
			<canvas bind:this={canvas} style:aspect-ratio="1024 / 384"></canvas>
		{/if}
	{/snippet}
	{#snippet controls()}
		<Slider label="Hs" bind:value={H} min={0.5} max={4} step={0.1} display="{fmt(H, 1)} m" />
		<Slider label="Tp" bind:value={T} min={8} max={18} step={0.5} display="{fmt(T, 1)} s" />
	{/snippet}
	{#snippet caption()}
		Along-shore left to right (Kitchen Windows to Albatross and beyond), land at the top, the wavemaker along the
		bottom edge; colour is surface elevation, white is foam. The second-order solver carries the swell to the coast at
		full height, the crests arrive oblique to the shore, and J-Bay breaks: foam forms in a narrow band on the inner
		edge of the shelf, in patches a few cells long that come and go as each crest arrives, most of it from Boneyards
		past the Point. Bathymetry is modelled from the coastline, not surveyed, and the breaking rule is fitted to one
		reference run.
	{/snippet}
</Frame>

<style>
	img,
	canvas {
		display: block;
		box-sizing: border-box;
		width: 100%;
		height: auto;
		border: 1px solid var(--line, rgba(122, 197, 200, 0.16));
		border-radius: 4px;
		background: var(--ink, #071019);
	}
</style>

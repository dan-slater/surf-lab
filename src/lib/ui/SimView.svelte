<!--
	The sim surface. Two modes, one engine:
	- fill (no `overlay`): its own canvas filling the parent, the grid cover-fit
	  to it, section names drawn over it;
	- map (`overlay` = a map-kit OverlayFrame in webgpu mode): draws into the
	  overlay's context, registered to the map through enuFrame + project.
	A new `scene.key` builds a new solver and spins the swell up from flat; a
	new `swell` only changes the forcing.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { requestDevice } from '#lib/sim/gpu.ts';
	import { affineFromOverlay, type Affine } from '#lib/sim/debug-render.ts';
	import { enuFrame } from '@dan-slater/map-kit/geo.ts';
	import type { OverlayFrame } from '@dan-slater/map-kit/overlay.ts';
	import type { SimScene } from '#lib/spots/scene.ts';
	import type { SpotSwell } from '#lib/spots/spots.ts';
	import { createSimEngine, enuToPixel, fillAffine, type SimEngine } from './sim-engine';

	type Status = { state: 'idle' | 'starting' | 'running' | 'error'; message?: string; offshore?: boolean };

	let {
		scene,
		swell,
		overlay = null,
		speed = 4,
		spinUpSeconds = 20,
		sets = true,
		labels = true,
		onstatus
	}: {
		scene: SimScene | null;
		swell: SpotSwell;
		overlay?: OverlayFrame | null;
		speed?: number;
		spinUpSeconds?: number;
		sets?: boolean;
		labels?: boolean;
		onstatus?: (s: Status) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let status = $state<Status>({ state: 'idle' });
	let engine: SimEngine | null = null;
	let affine: Affine | null = null;
	let size = $state({ w: 0, h: 0 });
	let labelPos = $state<{ name: string; x: number; y: number }[]>([]);
	let ownDevice: Promise<GPUDevice> | null = null;

	const setStatus = (s: Status) => {
		status = s;
		onstatus?.(s);
	};

	function device(): Promise<GPUDevice> {
		if (overlay?.gpu) return Promise.resolve(overlay.gpu.device as GPUDevice);
		ownDevice ??= requestDevice().then((r) => r.device);
		return ownDevice;
	}

	// one engine per scene (and per surface)
	$effect(() => {
		const sc = scene;
		const ov = overlay;
		const cv = canvas;
		if (!sc || (!ov && !cv)) return;
		let alive = true;
		let raf = 0;
		let local: SimEngine | null = null;
		setStatus({ state: 'starting' });
		(async () => {
			const dev = await device();
			if (!alive) return;
			// let the "starting" state paint before the bathymetry blocks the thread
			await new Promise((r) => setTimeout(r, 0));
			if (!alive) return;
			const target = ov
				? { context: ov.gpu!.context as GPUCanvasContext, format: ov.gpu!.format as GPUTextureFormat }
				: cv!;
			local = createSimEngine({ device: dev, target, scene: sc, swell: untrack(() => $state.snapshot(swell)), speed, spinUpSeconds, sets });
			engine = local;
			current = sc;
			setStatus({ state: 'running', offshore: local.generator.fromBehind });
			const enu = enuFrame(sc.lat, sc.lon);
			const loop = (now: number) => {
				if (!alive || !local) return;
				if (ov) {
					local.setAffine(affineFromOverlay(sc.grid, enu, ov));
				} else if (cv) {
					const dpr = Math.min(devicePixelRatio || 1, 2);
					const w = cv.clientWidth, h = cv.clientHeight;
					if (w && h && (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr))) {
						cv.width = Math.round(w * dpr);
						cv.height = Math.round(h * dpr);
					}
					if (w !== size.w || h !== size.h || !affine) {
						size = { w, h };
						affine = fillAffine(sc.grid, w, h);
						local.setAffine(affine);
						placeLabels(sc);
					}
				}
				local.tick(now);
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
		})().catch((e) => {
			if (alive) setStatus({ state: 'error', message: e instanceof Error ? e.message : String(e) });
		});
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			local?.dispose();
			if (engine === local) engine = null;
			affine = null;
			labelPos = [];
		};
	});

	// the dial: change the forcing, keep the sea state
	$effect(() => {
		const s = $state.snapshot(swell);
		if (engine) {
			engine.setSwell(s);
			const off = engine.generator.fromBehind;
			untrack(() => {
				if (off !== status.offshore) setStatus({ ...status, offshore: off });
			});
		}
	});

	// labels toggle with the chrome; re-place them without waiting for a resize
	let current: SimScene | null = null;
	$effect(() => {
		if (labels && current) placeLabels(current);
		else if (!labels) labelPos = [];
	});

	function placeLabels(sc: SimScene) {
		if (!labels || !affine) return;
		labelPos = sc.sections
			.filter((s) => s.x !== undefined && s.y !== undefined)
			.map((s) => {
				const [x, y] = enuToPixel(sc.grid, affine!, size.w, size.h, s.x!, s.y!);
				return { name: s.name, x, y };
			})
			.filter((p) => p.x > 0 && p.x < size.w && p.y > 0 && p.y < size.h);
	}
</script>

{#if overlay}
	{#if status.state === 'error'}<p class="sim-msg">{status.message}</p>{/if}
{:else}
	<div class="simview">
		<canvas bind:this={canvas}></canvas>
		{#each labelPos as l (l.name)}
			<span class="label" style="left: {l.x}px; top: {l.y}px">{l.name}</span>
		{/each}
		{#if status.state === 'error'}
			<p class="sim-msg">
				{status.message}. The sim needs WebGPU: a recent Chrome or Edge, or Safari 26.
			</p>
		{:else if status.state === 'starting'}
			<p class="sim-msg quiet">Shaping the seabed</p>
		{/if}
	</div>
{/if}

<style>
	.simview {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: var(--ink);
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
	}
	.label {
		position: absolute;
		transform: translate(-50%, -140%);
		font: 500 0.7rem/1 var(--mono);
		letter-spacing: 0.04em;
		color: var(--foam);
		opacity: 0.75;
		white-space: nowrap;
		pointer-events: none;
		text-shadow: 0 1px 3px var(--ink);
	}
	.sim-msg {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		max-width: 28rem;
		margin: 0;
		padding: 1rem 1.25rem;
		text-align: center;
		color: var(--text);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		font-size: 0.95rem;
		pointer-events: none;
	}
	.sim-msg.quiet {
		color: var(--muted);
		background: transparent;
		border: none;
		font-family: var(--mono);
		font-size: 0.8rem;
	}
</style>

<!--
	The world map: the catalogue as pins on a globe. Click a pin for its facts
	and today's forecast; click any coast to fly in, read the coastline from
	the vector tiles, model the seabed and spin a swell up on it. Panning while
	a sim runs re-centres the domain on the new view.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { Map, Pins, Panel, Overlay, coastlineNear, distanceMeters, type Pin, type OverlayFrame } from '@dan-slater/map-kit';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import SimView from '#lib/ui/SimView.svelte';
	import SpotFacts from '#lib/ui/SpotFacts.svelte';
	import { app, setSpot, setSwell } from '#lib/state/index.ts';
	import { spots, customSpot, isCustom, type Spot } from '#lib/spots/spots.ts';
	import { hasBundledCoast, putCoast, type Coast } from '#lib/spots/coasts.ts';
	import { loadScene } from '#lib/spots/load.ts';
	import { tileCoast, type TileCoast } from '#lib/spots/tiles.ts';
	import { buildScene, defaultDx, offshoreBearing, type SimScene } from '#lib/spots/scene.ts';
	import { todayForAll, type Today } from '#lib/forecast/index.ts';
	import { applyToday } from '#lib/ui/today.ts';

	const ZOOM = 14;
	const RADIUS = 2000;
	/** re-centre the sim when a pan moves the view this far from the domain origin */
	const RECENTRE_M = 700;

	type SpotPin = Pin<{ name: string; spot: Spot }>;
	const pins: SpotPin[] = spots.map((s) => ({ id: s.slug, lat: s.lat, lon: s.lon, props: { name: s.name, spot: s } }));

	let mapC = $state<ReturnType<typeof Map>>();
	let map = $state<MapLibreMap | null>(null);
	let selected = $state<string | null>(null);
	let selectedPin = $state<SpotPin | null>(null);
	let panelOpen = $state(false);
	let forecasts = $state<Record<string, Today | null>>({});
	let overlay = $state<OverlayFrame | null>(null);
	let gpuError = $state('');
	let scene = $state<SimScene | null>(null);
	let busy = $state(false);
	let message = $state('');
	let flying = false;

	onMount(() => {
		todayForAll(spots).then((all) => {
			const f: Record<string, Today | null> = {};
			spots.forEach((s, i) => (f[s.slug] = all[i]));
			forecasts = f;
		});
		if (import.meta.env.DEV) {
			// hooks for the headless checks in scripts/
			(window as any).__surflab = { simulateAt, coastAt, map: () => map, raw: (o: any) => coastlineNear(map!, o).then((r) => ({ n: r.polylines.length, stats: r.stats })), state: () => ({ scene: scene && { key: scene.key, grid: scene.grid, squeezed: scene.squeezed, guarded: scene.guarded }, message, busy }) };
		}
	});

	$effect(() => {
		panelOpen = selectedPin !== null;
	});

	async function coastAt(lon: number, lat: number, radius = RADIUS): Promise<TileCoast | null> {
		const c = await tileCoast(map!, lon, lat, radius);
		if (c && (c.flipped || c.unchecked)) console.info(`coast at ${lon.toFixed(4)},${lat.toFixed(4)}: ${c.flipped} polylines flipped, ${c.unchecked} unchecked`);
		return c;
	}

	/** Fly to a point, find its coast (bundled for catalogue spots, else from the tiles) and start a sim. */
	async function simulateAt(lon: number, lat: number, spot?: Spot): Promise<string> {
		if (!map || busy) return 'busy';
		busy = true;
		message = 'Flying in';
		try {
			flying = true;
			await mapC!.flyTo({ lon, lat, zoom: Math.max(ZOOM, map.getZoom()), pitch: 0, duration: map.getZoom() > 12 ? 600 : 2500 });
			flying = false;
			if (spot && hasBundledCoast(spot)) {
				message = 'Shaping the seabed';
				const r = await loadScene(spot, defaultDx());
				if (!r.scene) return (message = r.error);
				setSpot(spot);
				scene = r.scene;
			} else {
				message = 'Reading the coastline';
				const coast = await coastAt(lon, lat);
				if (!coast) {
					scene = null;
					return (message = 'No open-ocean coast within 2 km of here. Click closer to the shore.');
				}
				const here = spot ?? customSpot(lat, lon);
				message = 'Shaping the seabed';
				const r = await sceneFromCoast(here, coast);
				if (!r) return message;
				scene = r;
			}
			message = '';
			if (!spot) applyToday();
			return 'ok';
		} catch (e) {
			return (message = e instanceof Error ? e.message : String(e));
		} finally {
			flying = false;
			busy = false;
		}
	}

	async function sceneFromCoast(here: Spot, coast: Coast): Promise<SimScene | null> {
		try {
			const s = buildScene(here, coast, defaultDx());
			if (isCustom(here)) {
				// face the default swell straight at this coast until the forecast lands
				here = { ...here, defaultSwell: { ...here.defaultSwell, dirDeg: Math.round(offshoreBearing(s.grid)) } };
				putCoast(here.slug, coast);
			}
			setSpot(here);
			return s;
		} catch (e) {
			message = `Could not fit the sim to this coast: ${e instanceof Error ? e.message : e}`;
			return null;
		}
	}

	function onclick(e: { lon: number; lat: number }) {
		simulateAt(e.lon, e.lat);
	}

	function onmoveend(cam: { center: [number, number]; zoom: number }) {
		if (flying || busy || !scene || cam.zoom < 12) return;
		const [lon, lat] = cam.center;
		if (distanceMeters(lon, lat, scene.lon, scene.lat) > RECENTRE_M) {
			untrack(() => simulateAt(lon, lat));
		}
	}

	function closeSim() {
		scene = null;
		message = '';
		mapC?.flyTo({ lon: app.spot.lon, lat: app.spot.lat, zoom: 3, duration: 1800 });
	}

	function coverThis() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Globe · surf-lab</title>
	<meta name="description" content="Pick a famous break or click any coast on Earth and watch a swell build on it." />
</svelte:head>

<main class="mapview">
	<Map bind:this={mapC} bind:map center={[20, 5]} zoom={2} style="liberty" {onclick} {onmoveend}>
		{#snippet children()}
			<Overlay
				mode="webgpu"
				onready={(f) => (overlay = f)}
				onerror={(e) => (gpuError = `WebGPU is not available here (${e instanceof Error ? e.message : e}). The globe works; the sim needs a recent Chrome, Edge or Safari 26.`)}
			/>
			<Pins {pins} bind:selected bind:selectedPin />
			<Panel item={selectedPin} bind:open={panelOpen} title={selectedPin?.props?.name} onclose={() => (selected = null)}>
				{#snippet children(pin)}
					{@const s = pin.props!.spot}
					<p class="where">{s.region}, {s.country}</p>
					<SpotFacts spot={s} today={s.slug in forecasts ? forecasts[s.slug] : undefined} />
					<div class="actions">
						<button class="btn primary" disabled={busy} onclick={() => simulateAt(s.lon, s.lat, s)}>Simulate here</button>
						<a class="btn" href="/spot/{s.slug}">Spot page</a>
					</div>
				{/snippet}
			</Panel>
		{/snippet}
	</Map>

	{#if overlay && scene}
		<SimView {scene} swell={app.swell} {overlay} />
	{/if}

	<div class="bar">
		{#if scene}
			<div class="simbar">
				<strong>{scene.name}</strong>
				<span class="num swell">
					{app.swell.Hs.toFixed(1)} m, {app.swell.Tp.toFixed(0)} s from {Math.round(app.swell.dirDeg)}° ({app.source === 'today' ? 'today' : app.source === 'dial' ? 'dialled' : 'default'})
				</span>
				<button class="btn" onclick={() => applyToday()}>Today</button>
				<button class="btn primary" onclick={coverThis}>Cover this spot</button>
				<button class="btn" onclick={closeSim}>Close sim</button>
				<span class="honesty">Modelled from the coastline, not surveyed. Pan to move the domain.</span>
			</div>
		{:else if !message}
			<p class="hint">Click a pin, or click any coast to model it. <a href="/">Back to the cover</a></p>
		{/if}
		{#if message}<p class="msg">{message}</p>{/if}
		{#if gpuError}<p class="msg warn">{gpuError}</p>{/if}
	</div>
</main>

<style>
	.mapview {
		position: fixed;
		inset: 0;
	}
	.mapview :global(.mk-map) {
		cursor: crosshair;
	}
	.where {
		margin: -0.3rem 0 0.8rem;
		color: var(--muted);
		font-size: 0.85rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.bar {
		position: absolute;
		left: var(--gap);
		bottom: max(var(--gap), env(safe-area-inset-bottom));
		max-width: min(calc(100% - 2 * var(--gap)), 44rem);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		pointer-events: none;
		z-index: 10;
	}
	.bar > :global(*) {
		pointer-events: auto;
	}
	.simbar,
	.hint,
	.msg {
		margin: 0;
		padding: 0.6rem 0.8rem;
		background: var(--panel);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font-size: 0.9rem;
	}
	.simbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.7rem;
	}
	.simbar strong {
		font-family: var(--serif);
		font-weight: 500;
		font-size: 1.1rem;
	}
	.swell {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.honesty {
		flex-basis: 100%;
	}
	.msg {
		font-family: var(--mono);
		font-size: 0.8rem;
	}
	.msg.warn {
		color: var(--gold);
		font-family: var(--sans);
	}
</style>

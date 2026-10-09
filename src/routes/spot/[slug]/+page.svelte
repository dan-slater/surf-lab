<!-- One spot: its sim, its named sections, today's forecast and swell window. -->
<script lang="ts">
	import SimView from '#lib/ui/SimView.svelte';
	import SpotFacts from '#lib/ui/SpotFacts.svelte';
	import CompassDial from '#lib/ui/CompassDial.svelte';
	import { loadScene } from '#lib/spots/load.ts';
	import { defaultDx, type SimScene } from '#lib/spots/scene.ts';
	import { compassName, type Spot, type SpotSwell } from '#lib/spots/spots.ts';
	import { todayFor, type Today } from '#lib/forecast/index.ts';
	import { setSpot } from '#lib/state/index.ts';
	import { goto } from '$app/navigation';

	let { data }: { data: { spot: Spot } } = $props();
	const spot = $derived(data.spot);

	let scene = $state<SimScene | null>(null);
	let sceneError = $state('');
	let today = $state<Today | null | undefined>(undefined);
	let swell = $state<SpotSwell>({ Hs: 2, Tp: 13, dirDeg: 0 });

	$effect(() => {
		const s = spot;
		let alive = true;
		swell = { ...s.defaultSwell };
		today = undefined;
		scene = null;
		sceneError = '';
		loadScene(s, defaultDx()).then((r) => {
			if (!alive) return;
			scene = r.scene;
			sceneError = r.error ?? '';
		});
		todayFor({ slug: s.slug, lat: s.lat, lon: s.lon }).then((t) => {
			if (!alive) return;
			today = t;
			if (t) swell = { Hs: Math.max(0.5, Math.min(6, t.Hs)), Tp: Math.max(6, Math.min(20, t.Tp)), dirDeg: t.dirDeg };
		});
		return () => (alive = false);
	});

	function cover() {
		setSpot(spot);
		goto('/');
	}
</script>

<svelte:head>
	<title>{spot.name} · surf-lab</title>
	<meta name="description" content="{spot.name}, {spot.country}: {spot.wave.type}, {spot.wave.bottom}. A shallow-water sim modelled from the coastline, with today's swell." />
</svelte:head>

<main class="page">
	<nav><a href="/">Cover</a> <span>/</span> <a href="/map">Globe</a> <span>/</span> {spot.name}</nav>
	<header>
		<h1>{spot.name}</h1>
		<p class="where">{spot.region}, {spot.country}</p>
	</header>

	<section class="sim" aria-label="Simulation">
		<SimView {scene} {swell} />
		{#if sceneError}<p class="note">{sceneError}</p>{/if}
		<p class="honesty caption">
			Modelled from the coastline, not surveyed. {swell.Hs.toFixed(1)} m, {swell.Tp.toFixed(0)} s from {compassName(swell.dirDeg)}
			{today ? '(today)' : '(typical swell)'}.
		</p>
	</section>

	<div class="cols">
		<section>
			<SpotFacts {spot} {today} />
			<div class="actions">
				<button class="btn primary" onclick={cover}>Make this the cover</button>
				<a class="btn" href="/map">Open the globe</a>
			</div>
		</section>
		<section>
			<h2>Swell window</h2>
			<CompassDial value={Math.round(swell.dirDeg)} window={spot.swellWindow} size={150} label="Swell direction (deep water)" onchange={(d) => (swell = { ...swell, dirDeg: d })} />
			<p class="small">The teal arc is the window; the coral arrow is the swell on the sim. Drag it to try another direction.</p>
			{#if spot.sections?.length}
				<h2>Sections</h2>
				<ol class="sections">
					{#each spot.sections as s (s.name)}<li>{s.name}</li>{/each}
				</ol>
			{/if}
		</section>
	</div>
</main>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--gap);
		padding-bottom: 4rem;
	}
	nav {
		font-size: 0.85rem;
		color: var(--muted);
	}
	nav span {
		margin: 0 0.3rem;
		opacity: 0.6;
	}
	header {
		margin: 1rem 0;
	}
	h1 {
		font-size: clamp(2rem, 6vw, 3.4rem);
		margin: 0;
	}
	h2 {
		font-size: 1.15rem;
		margin-top: 1.4rem;
	}
	.where {
		margin: 0.2rem 0 0;
		color: var(--muted);
	}
	.sim {
		position: relative;
		margin: 0 calc(-1 * var(--gap));
	}
	.sim :global(.simview) {
		position: relative;
		inset: auto;
		height: min(62vh, 560px);
		min-height: 320px;
		border-radius: 0;
	}
	@media (min-width: 700px) {
		.sim {
			margin: 0;
		}
		.sim :global(.simview) {
			border-radius: var(--radius);
			border: 1px solid var(--line);
		}
	}
	.caption {
		margin: 0.5rem var(--gap) 0;
	}
	@media (min-width: 700px) {
		.caption {
			margin: 0.5rem 0 0;
		}
	}
	.note {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(90%, 28rem);
		margin: 0;
		padding: 1rem;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		text-align: center;
	}
	.cols {
		display: grid;
		gap: 1.5rem 3rem;
		margin-top: 1.5rem;
	}
	@media (min-width: 760px) {
		.cols {
			grid-template-columns: 1.3fr 1fr;
		}
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1.2rem;
	}
	.small {
		font-size: 0.82rem;
		color: var(--muted);
	}
	.sections {
		margin: 0;
		padding-left: 1.3rem;
		columns: 2;
		font-size: 0.92rem;
	}
</style>

<!--
	The cover and the dial: one sim, full screen. With no chrome it is the
	cover (the second-screen idle). Any key or click shows the dial; ten idle
	seconds hide it again.
-->
<script lang="ts">
	import SimView from '#lib/ui/SimView.svelte';
	import Dial from '#lib/ui/Dial.svelte';
	import { app, setChrome } from '#lib/state/index.ts';
	import { loadScene } from '#lib/spots/load.ts';
	import { defaultDx, type SimScene } from '#lib/spots/scene.ts';

	const IDLE_MS = 10_000;

	let scene = $state<SimScene | null>(null);
	let sceneError = $state('');
	let offshore = $state(false);
	let hint = $state(true);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const spot = app.spot;
		let alive = true;
		sceneError = '';
		loadScene($state.snapshot(spot), defaultDx()).then((r) => {
			if (!alive) return;
			scene = r.scene;
			sceneError = r.error ?? '';
		});
		return () => (alive = false);
	});

	$effect(() => {
		const t = setTimeout(() => (hint = false), 4000);
		return () => clearTimeout(t);
	});

	function wake() {
		hint = false;
		if (!app.chrome) setChrome(true);
		clearTimeout(timer);
		timer = setTimeout(() => setChrome(false), IDLE_MS);
	}

	$effect(() => () => clearTimeout(timer));
</script>

<svelte:head>
	<title>{app.spot.name} · surf-lab</title>
	<meta name="description" content="A shallow-water surf simulation of {app.spot.name}, modelled from the coastline." />
</svelte:head>

<svelte:window onkeydown={wake} onpointerdown={wake} oninput={wake} />

<main class="cover" class:chrome={app.chrome}>
	<SimView {scene} swell={app.swell} onstatus={(s) => (offshore = !!s.offshore)} labels={app.chrome} />

	{#if sceneError}
		<p class="notice">{sceneError} <a href="/map">Open the globe</a></p>
	{/if}

	{#if app.chrome}
		<div class="float">
			<Dial
				note={offshore
					? 'In deep water this swell comes from behind the coast. It reaches the shore by wrapping round, so the sim sends it in at the steepest angle the shelf allows.'
					: ''}
			/>
		</div>
	{:else if hint}
		<p class="hint">Tap or press any key for the dial</p>
	{/if}
</main>

<style>
	.cover {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--ink);
		cursor: none;
	}
	.cover.chrome {
		cursor: auto;
	}
	.float {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		padding: var(--gap);
		padding-bottom: max(var(--gap), env(safe-area-inset-bottom));
		pointer-events: none;
	}
	.float > :global(*) {
		pointer-events: auto;
	}
	@media (min-width: 900px) {
		.float {
			left: auto;
			right: 0;
			top: 0;
			bottom: auto;
		}
	}
	.hint {
		position: absolute;
		bottom: max(1.25rem, env(safe-area-inset-bottom));
		left: 0;
		right: 0;
		margin: 0;
		text-align: center;
		font: 0.75rem var(--mono);
		color: var(--muted);
		opacity: 0.8;
		animation: fade 4s forwards;
		pointer-events: none;
	}
	@keyframes fade {
		70% {
			opacity: 0.8;
		}
		100% {
			opacity: 0;
		}
	}
	.notice {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translateX(-50%);
		width: min(90%, 26rem);
		margin: 0;
		padding: 1rem 1.2rem;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		text-align: center;
	}
</style>

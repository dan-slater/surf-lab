<!--
	Every instrument on one page at the default swell: a test bench, and the
	page the screenshot script walks (scripts/shoot-instruments.ts).
-->
<script lang="ts">
	import { DEFAULT_SWELL, INSTRUMENTS } from '#lib/instruments/index.ts';
	import LazyMount from '../LazyMount.svelte';

	const swell = { ...DEFAULT_SWELL };
	const list = Object.values(INSTRUMENTS);
</script>

<svelte:head><title>Instruments · The Surf Physics Review</title></svelte:head>

<main>
	<p><a href="/book">← The Surf Physics Review</a></p>
	<h1>Instruments</h1>
	<p class="note">
		All {list.length} at J-Bay's default swell, H<sub>s</sub> {swell.Hs} m, T<sub>p</sub> {swell.Tp} s, from {swell.dirDeg}°.
		P1 to P6 are lifted from the research notes; the rest are built from their chapter's own equations.
	</p>
	{#each list as def (def.id)}
		<section id="i-{def.id}" data-instrument={def.id}>
			<LazyMount minHeight="24rem">
				<def.component {...swell} />
			</LazyMount>
		</section>
	{/each}
</main>

<style>
	main {
		max-width: 60rem;
		margin: 0 auto;
		padding: 2rem clamp(1rem, 3vw, 2rem) 6rem;
	}
	h1 {
		font-weight: 400;
		font-size: 2.6rem;
		margin: 0.5rem 0;
	}
	.note {
		color: var(--muted);
	}
	section {
		margin: 2rem 0;
	}
</style>

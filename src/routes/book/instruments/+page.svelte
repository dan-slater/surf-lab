<!--
	Every instrument on one page at the default swell: a test bench, and the
	page the screenshot script walks (scripts/shoot-instruments.ts).
-->
<script lang="ts">
	import { DEFAULT_SWELL, CHAPTER_SWELL, INSTRUMENTS, instrumentsInChapter } from '#lib/instruments/index.ts';
	import { CHAPTER_ORDER } from '../order';
	import LazyMount from '../LazyMount.svelte';

	const swell = { ...DEFAULT_SWELL };
	const list = Object.values(INSTRUMENTS);
	// each instrument as it first appears in the book: its chapter's swell and worked-number props
	const home = new Map<string, { swell: typeof swell; props: Record<string, unknown> }>();
	for (const slug of CHAPTER_ORDER)
		for (const e of instrumentsInChapter(slug))
			if (!home.has(e.id)) home.set(e.id, { swell: { ...DEFAULT_SWELL, ...CHAPTER_SWELL[slug] }, props: e.props ?? {} });
</script>

<svelte:head><title>Instruments · The Surf Physics Review</title></svelte:head>

<main>
	<p><a href="/book">← The Surf Physics Review</a></p>
	<h1>Instruments</h1>
	<p class="note">
		All {list.length}, each set up as it first appears in the book: J-Bay's swell (H<sub>s</sub> {swell.Hs} m, T<sub>p</sub>
		{swell.Tp} s, from {swell.dirDeg}°) unless its chapter works one example swell throughout. P1 to P6 are lifted from the
		research notes; the rest are built from their chapter's own equations.
	</p>
	{#each list as def (def.id)}
		<section id="i-{def.id}" data-instrument={def.id}>
			<LazyMount minHeight="24rem">
				<def.component {...home.get(def.id)?.swell ?? swell} {...home.get(def.id)?.props} />
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

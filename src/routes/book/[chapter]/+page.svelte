<!--
	A chapter: the text on the left, the current section's instrument pinned on
	the right and swapped as the reader scrolls. On a narrow screen each
	section's instrument is an inline figure under it instead.
-->
<script lang="ts">
	import {
		DEFAULT_SWELL,
		CHAPTER_SWELL,
		INSTRUMENTS,
		instrumentFor,
		instrumentsInChapter,
		type InstrumentEntry
	} from '#lib/instruments/index.ts';
	import InstrumentView from '../InstrumentView.svelte';
	import LazyMount from '../LazyMount.svelte';
	import { fmt } from '#lib/instruments/physics.ts';

	let { data } = $props();
	const ch = $derived(data.chapter);

	// HOOK(app state): the swell every instrument receives. When the app line's
	// global store lands in #lib/state, replace this $state with the store's
	// current spot and swell (one line), and drop the local sliders below.
	let swell = $state({ ...DEFAULT_SWELL });
	$effect.pre(() => {
		const s = CHAPTER_SWELL[ch.slug];
		swell = { ...DEFAULT_SWELL, ...s };
	});

	const perSection = $derived(ch.sections.map((_, i) => instrumentFor(ch.slug, i)));
	const all = $derived(instrumentsInChapter(ch.slug));
	const hasInstruments = $derived(all.length > 0);

	/** index of the section under the reader */
	let active = $state(0);
	/** manual override: an instrument id chosen in the picker, or '' to follow the text */
	let override = $state('');
	let tab = $state(0);

	// the entries for the active section; text-only sections keep the last instrument above them
	const following = $derived.by(() => {
		for (let i = active; i >= 0; i--) if (perSection[i]?.length) return perSection[i];
		return all.slice(0, 1);
	});
	const shown: InstrumentEntry[] = $derived(override ? all.filter((e) => e.id === override) : following);
	$effect.pre(() => {
		void following;
		tab = 0;
	});

	let wide = $state(true);
	$effect(() => {
		const mq = matchMedia('(min-width: 1100px)');
		const set = () => (wide = mq.matches);
		set();
		mq.addEventListener('change', set);
		return () => mq.removeEventListener('change', set);
	});

	// track the section heading nearest the top 40% of the viewport
	let article = $state<HTMLElement>();
	$effect(() => {
		if (!article) return;
		void ch.slug;
		const heads = [...article.querySelectorAll<HTMLElement>('section.sec > h2')];
		const update = () => {
			const line = innerHeight * 0.4;
			let a = 0;
			heads.forEach((h, i) => {
				if (h.getBoundingClientRect().top < line) a = i;
			});
			active = a;
		};
		const io = new IntersectionObserver(update, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
		heads.forEach((h) => io.observe(h));
		update();
		return () => io.disconnect();
	});

	function onPick(e: Event) {
		override = (e.currentTarget as HTMLSelectElement).value;
	}
</script>

<svelte:head>
	<title>{ch.title} · The Surf Physics Review</title>
	<meta name="description" content={ch.title} />
</svelte:head>

<div class="page" class:solo={!hasInstruments}>
	<article bind:this={article}>
		<nav class="crumbs"><a href="/book">The Surf Physics Review</a> · chapter {ch.number}</nav>
		<header>
			<h1>{ch.title}</h1>
			<p class="lede">{@html ch.lede}</p>
		</header>

		{#each ch.sections as s, i (s.id)}
			<section class="sec" id={s.id} class:current={i === active && hasInstruments && wide}>
				<h2>{s.heading}</h2>
				<div class="body">{@html s.html}</div>
				{#if s.onTheWave}
					<aside class="wave"><span class="tag">On the wave</span> {@html s.onTheWave}</aside>
				{/if}
				{#if s.diagramSpec}
					<details class="spec">
						<summary>Figure brief (not drawn yet)</summary>
						<p>{@html s.diagramSpec}</p>
					</details>
				{/if}
				{#if !wide && perSection[i]?.length}
					<div class="inline">
						<LazyMount>
							<InstrumentView entries={perSection[i]} {swell} />
						</LazyMount>
					</div>
				{/if}
			</section>
		{/each}

		{#if ch.keyEquations.length}
			<section class="eqs" id="key-equations">
				<h2>Key equations</h2>
				<ol>
					{#each ch.keyEquations as k, i (i)}
						<li>
							<div class="math">{@html k.html}</div>
							<p>{@html k.meaning}</p>
							{#if k.workedExample}<p class="worked"><span class="tag">Worked example</span> {@html k.workedExample}</p>{/if}
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if ch.citations.length}
			<section class="refs" id="references">
				<h2>References</h2>
				<ol>
					{#each ch.citations as r (r.n)}
						<li id="ref-{r.n}" value={r.n}>
							{@html r.html}
							{#if r.url}<a href={r.url} rel="noopener">link</a>{/if}
							{#if r.whyReadIt}<p class="why">{@html r.whyReadIt}</p>{/if}
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#if ch.changes.length}
			<details class="changes">
				<summary>Revision notes for this chapter</summary>
				<ul>
					{#each ch.changes as c, i (i)}<li>{@html c}</li>{/each}
				</ul>
			</details>
		{/if}

		<nav class="pager">
			{#if data.prev}<a href="/book/{data.prev.slug}">← {data.prev.title}</a>{:else}<span></span>{/if}
			{#if data.next}<a href="/book/{data.next.slug}">{data.next.title} →</a>{/if}
		</nav>
	</article>

	{#if hasInstruments}
		<aside class="bench" class:hidden={!wide} aria-label="Instrument for the current section">
			<div class="bar">
				<label>
					<span class="sr">Instrument</span>
					<select value={override} onchange={onPick}>
						<option value="">Follow the text: § {active + 1} {ch.sections[active]?.heading ?? ''}</option>
						{#each all as e (e.id)}
							<option value={e.id}>{INSTRUMENTS[e.id].name}</option>
						{/each}
					</select>
				</label>
				{#if override}<button type="button" onclick={() => (override = '')}>follow</button>{/if}
			</div>
			{#if wide}
				<InstrumentView entries={shown} {swell} bind:tab />
			{/if}
			<div class="swell">
				<span class="tag">Swell</span>
				<label>H<sub>s</sub> <input type="range" min="0.5" max="5" step="0.1" bind:value={swell.Hs} /> {fmt(swell.Hs, 1)} m</label>
				<label>T<sub>p</sub> <input type="range" min="6" max="20" step="0.5" bind:value={swell.Tp} /> {fmt(swell.Tp, 1)} s</label>
				<label>from <input type="range" min="185" max="255" step="1" bind:value={swell.dirDeg} /> {fmt(swell.dirDeg, 0)}°</label>
			</div>
		</aside>
	{/if}
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 40rem) minmax(0, 1fr);
		gap: 3rem;
		max-width: 96rem;
		margin: 0 auto;
		padding: 0 clamp(1rem, 3vw, 2.5rem);
	}
	.page.solo {
		grid-template-columns: minmax(0, 42rem);
		justify-content: center;
	}
	@media (max-width: 1099px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			max-width: 44rem;
		}
	}
	article {
		padding: 3rem 0 6rem;
		min-width: 0;
	}
	.crumbs {
		font-family: var(--mono);
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.crumbs a {
		text-decoration: none;
	}
	h1 {
		font-weight: 400;
		font-size: clamp(2.2rem, 5vw, 3.2rem);
		line-height: 1.08;
		margin: 0.8rem 0 1rem;
	}
	.lede {
		font-size: 1.3rem;
		color: var(--teal-hi);
		margin: 0 0 2.5rem;
	}
	.sec {
		border-left: 2px solid transparent;
		margin-left: -1.2rem;
		padding-left: calc(1.2rem - 2px);
		transition: border-color 0.3s;
	}
	.sec.current {
		border-left-color: var(--coral);
	}
	h2 {
		font-weight: 600;
		font-size: 1.5rem;
		line-height: 1.2;
		margin: 3rem 0 0.8rem;
		scroll-margin-top: 1rem;
	}
	.body :global(p) {
		margin: 0.8rem 0;
	}
	.body :global(a.cite) {
		font-size: 0.78em;
		text-decoration: none;
		color: var(--muted);
	}
	.body :global(strong) {
		color: var(--foam);
	}
	.wave {
		margin: 1.2rem 0;
		padding: 0.8rem 1.1rem;
		border-left: 3px solid var(--coral);
		background: linear-gradient(90deg, rgba(255, 138, 92, 0.07), transparent 75%);
		font-size: 1.05rem;
	}
	.tag {
		font-family: var(--mono);
		font-size: 0.62rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--coral);
		margin-right: 0.4em;
	}
	details {
		margin: 0.8rem 0;
		color: var(--muted);
		font-size: 0.95rem;
	}
	summary {
		cursor: pointer;
		font-family: var(--mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.inline {
		margin: 1.4rem 0;
	}
	.eqs ol,
	.refs ol {
		padding-left: 1.4rem;
	}
	.eqs li {
		margin: 1.4rem 0;
	}
	.worked {
		color: var(--muted);
		font-size: 1rem;
	}
	.refs li {
		margin: 0.8rem 0;
		font-size: 1rem;
	}
	.refs .why {
		margin: 0.3rem 0 0;
		color: var(--muted);
		font-size: 0.95rem;
	}
	.refs li:target {
		background: rgba(255, 138, 92, 0.08);
	}
	.pager {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 4rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
		font-size: 1.05rem;
	}
	.bench {
		position: sticky;
		top: 0;
		align-self: start;
		max-height: 100vh;
		overflow-y: auto;
		padding: 1.5rem 0 1.5rem;
	}
	.bench.hidden {
		display: none;
	}
	.bar {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		margin-bottom: 0.8rem;
	}
	.bar label {
		flex: 1;
	}
	select,
	.bar button {
		font-family: var(--mono);
		font-size: 0.7rem;
		background: var(--panel);
		color: var(--text);
		border: 1px solid var(--line-strong);
		border-radius: 3px;
		padding: 0.4em 0.6em;
		width: 100%;
	}
	.bar button {
		width: auto;
		cursor: pointer;
	}
	.swell {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		align-items: center;
		margin-top: 0.9rem;
		font-family: var(--mono);
		font-size: 0.68rem;
		color: var(--muted);
	}
	.swell label {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.swell input {
		width: 6rem;
		accent-color: var(--coral);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>

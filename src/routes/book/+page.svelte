<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>The Surf Physics Review</title>
	<meta name="description" content="The physics of surfing in nine chapters, each section with a live instrument beside it." />
</svelte:head>

<main>
	<header>
		<p class="kicker">surf-lab · the book</p>
		<h1>The Surf Physics Review</h1>
		<p class="standfirst">
			Nine chapters, from the storm to the fin. Beside each section sits an instrument you can drive: the equations of
			that section, running, set by default to Jeffreys Bay on a 2.5 m, 15 s swell.
		</p>
	</header>
	<ol class="contents">
		{#each data.chapters as c (c.slug)}
			<li>
				<a href="/book/{c.slug}">
					<span class="n">{c.number}</span>
					<span class="t">{c.title}</span>
				</a>
				<p class="lede">{@html c.lede}</p>
			</li>
		{/each}
	</ol>
	<footer><a href="/book/instruments">All instruments on one page</a></footer>
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: 4rem clamp(1rem, 4vw, 2rem) 6rem;
	}
	.kicker {
		font-family: var(--mono);
		font-size: 0.7rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--coral);
		margin: 0;
	}
	h1 {
		font-weight: 400;
		font-size: clamp(2.4rem, 6vw, 3.6rem);
		line-height: 1.05;
		margin: 0.6rem 0 1rem;
	}
	.standfirst {
		color: var(--muted);
		margin: 0 0 3rem;
	}
	.contents {
		list-style: none;
		padding: 0;
		margin: 0;
		border-top: 1px solid var(--line);
	}
	.contents li {
		padding: 1.4rem 0;
		border-bottom: 1px solid var(--line);
	}
	.contents a {
		display: flex;
		gap: 1rem;
		align-items: baseline;
		text-decoration: none;
	}
	.n {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--coral);
		min-width: 1.4rem;
	}
	.t {
		font-size: 1.6rem;
		line-height: 1.2;
		color: var(--text);
	}
	.contents a:hover .t {
		color: var(--teal-hi);
	}
	.lede {
		margin: 0.4rem 0 0 2.4rem;
		color: var(--muted);
		font-size: 1.02rem;
	}
	footer {
		margin-top: 2.5rem;
		font-family: var(--mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
	}
</style>

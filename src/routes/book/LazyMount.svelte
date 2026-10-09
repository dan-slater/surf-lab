<!--
	Mounts its children only once the placeholder comes near the viewport, so a
	phone page with an inline instrument under every section does not start
	them all at once.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children, minHeight = '18rem' }: { children: Snippet; minHeight?: string } = $props();
	let el = $state<HTMLDivElement>();
	let shown = $state(false);

	$effect(() => {
		if (!el || shown) return;
		const io = new IntersectionObserver(
			(e) => {
				if (e.some((x) => x.isIntersecting)) shown = true;
			},
			{ rootMargin: '400px 0px' }
		);
		io.observe(el);
		return () => io.disconnect();
	});
</script>

<div bind:this={el} style:min-height={shown ? undefined : minHeight}>
	{#if shown}{@render children()}{/if}
</div>

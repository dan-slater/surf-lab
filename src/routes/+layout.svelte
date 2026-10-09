<script lang="ts">
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { restore } from '#lib/state/index.ts';

	let { children }: { children: Snippet } = $props();

	onMount(restore);
</script>

{@render children()}

<script lang="ts">
	import '@fontsource/libertinus-serif/400.css';
	import '@fontsource/libertinus-serif/400-italic.css';
	import '@fontsource/libertinus-serif/600.css';
	import '@fontsource/spline-sans-mono/400.css';
	import 'katex/dist/katex.min.css';
	import './tokens.css';

	let { children } = $props();
</script>

<div class="book">{@render children()}</div>

<style>
	:global(body) {
		margin: 0;
		background: #071019;
	}
</style>

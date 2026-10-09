<!--
	The card every instrument sits in: title, canvas, controls, readout, caption.
	The canvas keeps the aspect ratio of its logical size; stage.ts scales it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		W,
		H,
		canvas = $bindable(),
		readout = '',
		error = '',
		controls,
		caption,
		figure
	}: {
		title: string;
		W: number;
		H: number;
		canvas?: HTMLCanvasElement;
		/** Trusted HTML built by the instrument itself (numbers in <b>, verdicts in .good/.bad). */
		readout?: string;
		error?: string;
		controls?: Snippet;
		caption?: Snippet;
		/** Replaces the canvas, e.g. a static image when a live surface is unavailable. */
		figure?: Snippet;
	} = $props();

	// separators become line breaks when the card is narrow (see the container query below)
	const html = $derived(readout.replace(/(?:\s|&nbsp;)+[·|](?:\s|&nbsp;)+/g, '<span class="sep"> · </span>'));
</script>

<figure class="instrument">
	<div class="head">
		<span class="title">{title}</span>
		{#if error}<span class="err">{error}</span>{/if}
	</div>
	{#if figure}
		{@render figure()}
	{:else}
		<canvas bind:this={canvas} style:aspect-ratio="{W} / {H}"></canvas>
	{/if}
	{#if controls}<div class="controls">{@render controls()}</div>{/if}
	{#if readout}<div class="readout">{@html html}</div>{/if}
	{#if caption}<figcaption>{@render caption()}</figcaption>{/if}
</figure>

<style>
	.instrument {
		container-type: inline-size;
		margin: 0;
		background: var(--panel, #0c1e2c);
		border: 1px solid var(--line, rgba(122, 197, 200, 0.16));
		border-radius: 6px;
		padding: 1rem;
		color: var(--text, #e9f0ec);
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.title {
		font-family: var(--mono, monospace);
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold, #ffb454);
	}
	.err {
		font-family: var(--mono, monospace);
		font-size: 0.68rem;
		color: var(--coral, #ff8a5c);
	}
	canvas {
		display: block;
		box-sizing: border-box;
		width: 100%;
		height: auto;
		background: var(--ink, #071019);
		border: 1px solid var(--line, rgba(122, 197, 200, 0.16));
		border-radius: 4px;
	}
	.controls {
		display: flex;
		gap: 0.9rem 1.6rem;
		flex-wrap: wrap;
		margin-top: 0.9rem;
		align-items: center;
	}
	.readout {
		font-family: var(--mono, monospace);
		font-size: 0.7rem;
		line-height: 1.85;
		color: var(--muted, #93aab0);
		margin-top: 0.7rem;
		letter-spacing: 0.03em;
	}
	@container (max-width: 560px) {
		.readout :global(.sep) {
			display: block;
			height: 0.25em;
			overflow: hidden;
			color: transparent;
		}
		.controls {
			gap: 0.6rem 1rem;
		}
	}
	@media (max-width: 480px) {
		.instrument {
			padding: 0.7rem;
		}
	}
	.readout :global(b) {
		color: var(--teal-hi, #b5e5e2);
		font-weight: 500;
	}
	.readout :global(.bad) {
		color: var(--coral, #ff8a5c);
	}
	.readout :global(.good) {
		color: var(--good, #8ed99a);
	}
	figcaption {
		font-size: 0.86rem;
		line-height: 1.5;
		color: var(--muted, #93aab0);
		margin-top: 0.8rem;
	}
	.controls :global(button) {
		font-family: var(--mono, monospace);
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: none;
		border: 1px solid var(--line-strong, rgba(122, 197, 200, 0.4));
		border-radius: 3px;
		color: var(--foam, #f2efe6);
		padding: 0.5em 1.2em;
		cursor: pointer;
	}
	.controls :global(button:hover) {
		border-color: var(--coral, #ff8a5c);
		color: var(--coral, #ff8a5c);
	}
</style>

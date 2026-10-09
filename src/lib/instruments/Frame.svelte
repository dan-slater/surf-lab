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
</script>

<figure class="instrument">
	<div class="head">
		<span class="title">{title}</span>
		{#if error}<span class="err">{error}</span>{/if}
	</div>
	{#if figure}
		{@render figure()}
	{:else}
		<div class="scroll"><canvas bind:this={canvas} style:aspect-ratio="{W} / {H}"></canvas></div>
	{/if}
	{#if controls}<div class="controls">{@render controls()}</div>{/if}
	{#if readout}<div class="readout">{@html readout}</div>{/if}
	{#if caption}<figcaption>{@render caption()}</figcaption>{/if}
</figure>

<style>
	.instrument {
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
	/* on a phone keep labels legible: the canvas keeps a minimum width and scrolls sideways */
	.scroll {
		overflow-x: auto;
	}
	@media (max-width: 640px) {
		canvas {
			min-width: 600px;
		}
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

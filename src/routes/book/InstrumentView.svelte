<!--
	One section's instruments: tabs when there is more than one, the chosen
	instrument mounted with the swell props, and its one-line caption.
-->
<script lang="ts">
	import { INSTRUMENTS, type InstrumentEntry } from '#lib/instruments/index.ts';
	import type { SwellProps } from '#lib/instruments/types.ts';

	let { entries, swell, tab = $bindable(0) }: { entries: InstrumentEntry[]; swell: SwellProps; tab?: number } = $props();

	const entry = $derived(entries[Math.min(tab, entries.length - 1)]);
	const def = $derived(entry ? INSTRUMENTS[entry.id] : undefined);
</script>

{#if entry && def}
	{#if entries.length > 1}
		<div class="tabs" role="tablist">
			{#each entries as en, i (en.id)}
				<button type="button" role="tab" aria-selected={i === tab} class:on={i === tab} onclick={() => (tab = i)}>
					{INSTRUMENTS[en.id].name}
				</button>
			{/each}
		</div>
	{/if}
	<p class="line">{entry.caption}</p>
	{#key entry}
		<def.component {...swell} {...entry.props} />
	{/key}
{/if}

<style>
	.tabs {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.tabs button {
		font-family: var(--mono);
		font-size: 0.64rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		background: none;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.35em 0.8em;
		cursor: pointer;
	}
	.tabs button.on {
		color: var(--foam);
		border-color: var(--coral);
	}
	.line {
		font-style: italic;
		color: var(--teal-hi);
		margin: 0 0 0.6rem;
		font-size: 1rem;
	}
</style>

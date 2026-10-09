<!-- A spot's facts and this hour's forecast, for the map panel and the spot page. -->
<script lang="ts">
	import { compassName, inWindow, type Spot } from '#lib/spots/spots.ts';
	import type { Today } from '#lib/forecast/index.ts';

	let { spot, today }: { spot: Spot; today: Today | null | undefined } = $props();

	const w = $derived(spot.swellWindow);
	const open = $derived(today ? inWindow(today.dirDeg, w) : false);
</script>

<dl class="facts">
	<dt>Wave</dt>
	<dd>{spot.wave.type}, {spot.wave.direction === 'both' ? 'lefts and rights' : `${spot.wave.direction}-hander`}</dd>
	<dt>Bottom</dt>
	<dd>{spot.wave.bottom}</dd>
	<dt>Swell window</dt>
	<dd class="num">{compassName(w.fromDeg)} to {compassName(w.toDeg)} ({w.fromDeg}° to {w.toDeg}°)</dd>
	<dt>Position</dt>
	<dd class="num">{spot.lat.toFixed(4)}, {spot.lon.toFixed(4)}</dd>
</dl>

<div class="today">
	<h3>Today</h3>
	{#if today === undefined}
		<p class="muted num">Fetching the forecast</p>
	{:else if today === null}
		<p class="muted">No forecast for this point right now.</p>
	{:else}
		<p class="num big">
			{today.Hs.toFixed(1)} m &middot; {today.Tp.toFixed(0)} s &middot; {compassName(today.dirDeg)}
			<span class="dir">{Math.round(today.dirDeg)}°</span>
		</p>
		<p class="muted num">
			{today.partition === 'swell' ? 'swell' : 'total sea'} at {today.at.slice(11)} local,
			{open ? 'inside' : 'outside'} the swell window
		</p>
	{/if}
	<p class="credit">Forecast: <a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a> (CC BY 4.0)</p>
</div>

<style>
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 0.9rem;
		margin: 0 0 1rem;
		font-size: 0.92rem;
	}
	dt {
		color: var(--muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		padding-top: 0.15rem;
	}
	dd {
		margin: 0;
	}
	h3 {
		font-size: 1rem;
		margin-bottom: 0.3rem;
	}
	.big {
		font-size: 1.1rem;
		margin: 0;
	}
	.dir {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.muted {
		color: var(--muted);
		font-size: 0.82rem;
		margin: 0.2rem 0;
	}
	.credit {
		font-size: 0.72rem;
		color: var(--muted);
		margin: 0.6rem 0 0;
	}
</style>

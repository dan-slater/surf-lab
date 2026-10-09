<!--
	The dial: Hs, Tp and direction as three floating controls, a spot picker,
	"today" (the forecast for this hour) and a link to the globe. Everything
	reads and writes the app store.
-->
<script lang="ts">
	import { app, setSpot, setSwell } from '#lib/state/index.ts';
	import { spots, spotBySlug, isCustom, compassName } from '#lib/spots/spots.ts';
	import CompassDial from './CompassDial.svelte';
	import { applyToday, DIAL } from './today';

	let { note = '' }: { note?: string } = $props();

	let busy = $state(false);
	let todayMsg = $state('');

	async function today() {
		busy = true;
		todayMsg = '';
		try {
			const t = await applyToday();
			todayMsg = t
				? `Open-Meteo, ${t.at.slice(11)} local${t.partition === 'sea' ? ' (total sea)' : ''}`
				: 'No forecast for this spot right now';
		} finally {
			busy = false;
		}
	}

	function pick(slug: string) {
		const s = spotBySlug(slug);
		if (s) setSpot(s);
		todayMsg = '';
	}

	const sourceLabel = $derived(
		app.source === 'today' ? 'today' : app.source === 'dial' ? 'dialled' : 'typical swell'
	);
</script>

<section class="dial" aria-label="Swell controls">
	<header>
		<label class="spot">
			<span class="visually-hidden">Spot</span>
			<select value={app.spot.slug} onchange={(e) => pick(e.currentTarget.value)}>
				{#if isCustom(app.spot)}<option value="here">{app.spot.name}</option>{/if}
				{#each spots as s (s.slug)}
					<option value={s.slug}>{s.name}</option>
				{/each}
			</select>
		</label>
		<span class="source num">{sourceLabel}</span>
	</header>

	<div class="controls">
		<div class="sliders">
			<label class="slider">
				<span class="k">Height</span>
				<span class="v num">{app.swell.Hs.toFixed(1)} m</span>
				<input
					type="range"
					min={DIAL.Hs.min}
					max={DIAL.Hs.max}
					step={DIAL.Hs.step}
					value={app.swell.Hs}
					oninput={(e) => setSwell({ Hs: Number(e.currentTarget.value) }, 'dial')}
				/>
			</label>
			<label class="slider">
				<span class="k">Period</span>
				<span class="v num">{app.swell.Tp.toFixed(1)} s</span>
				<input
					type="range"
					min={DIAL.Tp.min}
					max={DIAL.Tp.max}
					step={DIAL.Tp.step}
					value={app.swell.Tp}
					oninput={(e) => setSwell({ Tp: Number(e.currentTarget.value) }, 'dial')}
				/>
			</label>
		</div>
		<CompassDial
			value={app.swell.dirDeg}
			window={isCustom(app.spot) ? null : app.spot.swellWindow}
			label="Deep-water swell direction, degrees from"
			onchange={(d) => setSwell({ dirDeg: d }, 'dial')}
		/>
	</div>

	<div class="actions">
		<button class="btn primary" onclick={today} disabled={busy}>{busy ? 'Fetching' : 'Today'}</button>
		<a class="btn" href="/map">Globe</a>
		{#if !isCustom(app.spot)}<a class="btn" href="/spot/{app.spot.slug}">About {app.spot.name}</a>{/if}
	</div>
	{#if todayMsg}<p class="msg num">{todayMsg}</p>{/if}
	{#if note}<p class="msg warn">{note}</p>{/if}
	<p class="honesty">
		Modelled from the coastline, not surveyed. Swell {app.swell.Hs.toFixed(1)} m, {app.swell.Tp.toFixed(0)} s from
		{compassName(app.swell.dirDeg)} in deep water.
	</p>
</section>

<style>
	.dial {
		width: min(100%, 30rem);
		padding: 0.9rem 1rem 0.8rem;
		background: var(--panel);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--line);
		border-radius: 14px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.6rem;
	}
	select {
		font: 500 1.35rem/1.2 var(--serif);
		color: var(--text);
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--line-strong);
		padding: 0 1.2rem 0.1rem 0;
		max-width: 100%;
		cursor: pointer;
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, var(--teal) 50%),
			linear-gradient(135deg, var(--teal) 50%, transparent 50%);
		background-position:
			calc(100% - 9px) 55%,
			calc(100% - 4px) 55%;
		background-size: 5px 5px;
		background-repeat: no-repeat;
	}
	select option {
		background: var(--panel-solid);
		font-family: var(--sans);
		font-size: 1rem;
	}
	.source {
		font-size: 0.72rem;
		color: var(--teal);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
	}
	.controls {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.9rem;
		align-items: center;
	}
	.sliders {
		display: grid;
		gap: 0.6rem;
	}
	.slider {
		display: grid;
		grid-template-columns: 1fr auto;
		row-gap: 0.25rem;
	}
	.k {
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.v {
		font-size: 0.95rem;
		text-align: right;
	}
	input[type='range'] {
		grid-column: 1 / -1;
		width: 100%;
		accent-color: var(--accent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.8rem;
	}
	.msg {
		margin: 0.5rem 0 0;
		font-size: 0.78rem;
		color: var(--muted);
	}
	.msg.warn {
		color: var(--gold);
		font-family: var(--sans);
	}
	.honesty {
		margin: 0.6rem 0 0;
	}
</style>

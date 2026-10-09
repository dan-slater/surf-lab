<script lang="ts">
	let {
		label,
		value = $bindable(),
		min,
		max,
		step = 1,
		display
	}: { label: string; value: number; min: number; max: number; step?: number; display: string } = $props();
</script>

<label class="ctl">
	<span class="lab">{label} <output>{display}</output></span>
	<input type="range" {min} {max} {step} bind:value />
</label>

<style>
	.ctl {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 150px;
		flex: 1 1 150px;
		max-width: 240px;
	}
	.lab {
		font-family: var(--mono, monospace);
		font-size: 0.62rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--muted, #93aab0);
		display: flex;
		justify-content: space-between;
		gap: 0.5em;
	}
	output {
		color: var(--teal-hi, #b5e5e2);
	}
	input {
		width: 100%;
		accent-color: var(--coral, #ff8a5c);
	}
</style>

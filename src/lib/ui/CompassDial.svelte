<!--
	A compass for the direction the swell comes FROM. Drag round the ring, or
	use the arrow keys (5 deg; shift for 1 deg). The arrow points the way the
	swell travels, from the rim toward the centre. An optional window arc marks
	a spot's swell window.
-->
<script lang="ts">
	import { compassName, type SwellWindow } from '#lib/spots/spots.ts';

	let {
		value = $bindable(0),
		window: win = null,
		size = 112,
		label = 'Swell direction',
		onchange
	}: {
		value?: number;
		window?: SwellWindow | null;
		size?: number;
		label?: string;
		onchange?: (deg: number) => void;
	} = $props();

	let svg: SVGSVGElement;
	let dragging = false;
	const R = 44;

	const norm = (d: number) => ((Math.round(d) % 360) + 360) % 360;
	// compass deg -> svg point on a circle of radius r (0 = up, clockwise)
	const at = (deg: number, r: number) => {
		const a = (deg * Math.PI) / 180;
		return [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
	};

	function set(d: number) {
		value = norm(d);
		onchange?.(value);
	}

	function fromPointer(e: PointerEvent) {
		const b = svg.getBoundingClientRect();
		const x = e.clientX - (b.left + b.width / 2);
		const y = e.clientY - (b.top + b.height / 2);
		set((Math.atan2(x, -y) * 180) / Math.PI);
	}

	function key(e: KeyboardEvent) {
		const step = e.shiftKey ? 1 : 5;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(value + step);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(value - step);
		else return;
		e.preventDefault();
	}

	const arc = $derived.by(() => {
		if (!win) return '';
		const span = (((win.toDeg - win.fromDeg) % 360) + 360) % 360;
		const [x0, y0] = at(win.fromDeg, R);
		const [x1, y1] = at(win.fromDeg + span, R);
		return `M ${x0} ${y0} A ${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`;
	});
	const tail = $derived(at(value, R - 4));
	const head = $derived(at(value, 12));
</script>

<div class="compass" style="width: {size}px">
	<svg
		bind:this={svg}
		viewBox="0 0 100 100"
		width={size}
		height={size}
		role="slider"
		tabindex="0"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={359}
		aria-valuenow={value}
		aria-valuetext="{value} degrees, {compassName(value)}"
		onpointerdown={(e) => {
			dragging = true;
			svg.setPointerCapture(e.pointerId);
			fromPointer(e);
		}}
		onpointermove={(e) => dragging && fromPointer(e)}
		onpointerup={() => (dragging = false)}
		onpointercancel={() => (dragging = false)}
		onkeydown={key}
	>
		<circle cx="50" cy="50" r={R} class="ring" />
		{#if arc}<path d={arc} class="window" />{/if}
		{#each [0, 90, 180, 270] as d (d)}
			{@const [x, y] = at(d, R + 0.5)}
			{@const [x2, y2] = at(d, R - 5)}
			<line x1={x} y1={y} x2={x2} y2={y2} class="tick" />
		{/each}
		<text x="50" y="16" class="cardinal">N</text>
		<line x1={tail[0]} y1={tail[1]} x2={head[0]} y2={head[1]} class="arrow" />
		<circle cx={head[0]} cy={head[1]} r="3.2" class="arrowhead" />
		<circle cx={tail[0]} cy={tail[1]} r="4.5" class="knob" />
	</svg>
	<span class="readout num">{value}° {compassName(value)}</span>
</div>

<style>
	.compass {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}
	svg {
		touch-action: none;
		cursor: grab;
		border-radius: 50%;
		outline: none;
	}
	svg:focus-visible {
		box-shadow: 0 0 0 2px var(--accent);
	}
	.ring {
		fill: rgba(7, 16, 25, 0.55);
		stroke: var(--line-strong);
		stroke-width: 1;
	}
	.window {
		fill: none;
		stroke: var(--teal);
		stroke-width: 3;
		opacity: 0.55;
	}
	.tick {
		stroke: var(--muted);
		stroke-width: 1;
	}
	.cardinal {
		fill: var(--muted);
		font: 600 8px var(--sans);
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.arrow {
		stroke: var(--accent);
		stroke-width: 2;
		stroke-linecap: round;
	}
	.arrowhead {
		fill: var(--accent);
	}
	.knob {
		fill: var(--foam);
		stroke: var(--accent);
		stroke-width: 1.5;
	}
	.readout {
		font-size: 0.78rem;
		color: var(--text);
	}
</style>

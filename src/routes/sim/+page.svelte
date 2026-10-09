<script lang="ts">
	import { bathyFromPolyline } from '#lib/sim/bathy.ts';
	import { createSolver, type Solver } from '#lib/sim/solver.ts';
	import { createDebugRenderer } from '#lib/sim/debug-render.ts';
	import { requestDevice } from '#lib/sim/gpu.ts';
	import { JBAY, JBAY_RUN_A_SWELL, jbayGrid } from '#lib/spots/jbay.ts';

	let canvas: HTMLCanvasElement;
	let status = $state('starting');
	let modelTime = $state(0);
	let fps = $state(0);
	let label = $state('');

	$effect(() => {
		let raf = 0;
		let solver: Solver | undefined;
		let alive = true;
		(async () => {
			const { device } = await requestDevice();
			const q = new URLSearchParams(location.search);
			const swell = {
				...JBAY_RUN_A_SWELL,
				Hs: Number(q.get('hs') ?? JBAY_RUN_A_SWELL.Hs),
				Tp: Number(q.get('tp') ?? JBAY_RUN_A_SWELL.Tp),
				dirDeg: Number(q.get('dir') ?? JBAY_RUN_A_SWELL.dirDeg)
			};
			const grid = jbayGrid(Number(q.get('dx') ?? 6.25));
			const scheme = (q.get('scheme') ?? 'muscl') as 'muscl' | 'first-order';
			const { depth } = bathyFromPolyline(JBAY.coast, grid);
			solver = createSolver(device, {
				nx: grid.nx, ny: grid.ny, dx: grid.dx, depth, swell, scheme,
				wavemaker: { width: 75 / grid.dx },
				sponge: { width: 150 / grid.dx }
			});
			label = `${scheme}, ${grid.nx} x ${grid.ny} at ${grid.dx} m, dt ${solver.params.dt.toFixed(3)} s`;
			const warm = Number(q.get('warm') ?? 0);
			if (warm > 0) solver.step(Math.round(warm / solver.params.dt));
			// model seconds per real second
			const speed = Number(q.get('speed') ?? 10);
			let owed = 0;
			let prev = performance.now();
			const r = createDebugRenderer(device, canvas, solver);
			status = 'running';
			let frames = 0;
			let last = performance.now();
			const frame = () => {
				if (!alive || !solver) return;
				const now0 = performance.now();
				owed += (Math.min(now0 - prev, 100) / 1000) * speed;
				prev = now0;
				const n = Math.floor(owed / solver.params.dt);
				owed -= n * solver.params.dt;
				if (n > 0) solver.step(n);
				r.draw();
				modelTime = solver.time;
				frames++;
				const now = performance.now();
				if (now - last > 500) {
					fps = (frames * 1000) / (now - last);
					frames = 0;
					last = now;
				}
				raf = requestAnimationFrame(frame);
			};
			raf = requestAnimationFrame(frame);
		})().catch((e) => (status = String(e)));
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			solver?.dispose();
		};
	});
</script>

<p>
	J-Bay, {label}. Along-shore left to right (south to north), land at the top, wavemaker at the bottom.
	{status}. t = {modelTime.toFixed(1)} s, {fps.toFixed(0)} fps.
	Query: ?hs=2.5&amp;tp=15&amp;dir=120&amp;warm=300&amp;speed=10&amp;dx=6.25&amp;scheme=muscl
</p>
<canvas bind:this={canvas} width={1024} height={384} style="width: 100%; max-width: 1536px"></canvas>

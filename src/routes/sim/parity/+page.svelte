<script lang="ts">
	// Parity harness. Driven headless by scripts/parity-gpu.ts, which reads
	// window.__parity when it is set. Query: ?spinup=480&record=120
	import { bathyFromPolyline } from '#lib/sim/bathy.ts';
	import { createSolver } from '#lib/sim/solver.ts';
	import { createCpuSolver } from '#lib/sim/cpu.ts';
	import { requestDevice } from '#lib/sim/gpu.ts';
	import { JBAY, JBAY_RUN_A_SWELL, jbayGrid } from '#lib/spots/jbay.ts';

	let log = $state<string[]>([]);
	const say = (s: string) => (log = [...log, s]);

	$effect(() => {
		(async () => {
			const q = new URLSearchParams(location.search);
			const spinup = Number(q.get('spinup') ?? 480);
			const record = Number(q.get('record') ?? 120);
			const { adapter, device } = await requestDevice();
			const info = adapter.info;
			say(`adapter: ${info.vendor} ${info.architecture} ${info.device} ${info.description}`);
			const errors: string[] = [];
			device.addEventListener('uncapturederror', (e) => errors.push((e as GPUUncapturedErrorEvent).error.message));
			const dx = Number(q.get('dx') ?? 12.5);
			const scheme = (q.get('scheme') ?? 'muscl') as 'muscl' | 'first-order';
			const grid = jbayGrid(dx);
			const { depth } = bathyFromPolyline(JBAY.coast, grid, undefined, {}, { supersample: Math.max(1, Math.round(dx / 2.5)) });
			const breaking = q.get('breaking') ? JSON.parse(q.get('breaking')!) : undefined;
			const opts = {
				nx: grid.nx, ny: grid.ny, dx, depth, swell: JBAY_RUN_A_SWELL, scheme, breaking,
				dt: q.get('dt') ? Number(q.get('dt')) : undefined,
				// same widths in metres as Run C at 12.5 m
				wavemaker: { width: 75 / dx },
				sponge: { width: 150 / dx }
			};
			

			// 1. GPU vs CPU twin from rest
			const twinSteps = Number(q.get('twin') ?? (dx < 12.5 ? 0 : 100));
			const gpu = createSolver(device, opts);
			say(`scheme ${scheme}, ${grid.nx} x ${grid.ny} at ${dx} m, dt ${gpu.params.dt.toFixed(3)} s, Froude ${gpu.params.froudeT.toFixed(2)}`);
			const cpu = createCpuSolver(opts);
			gpu.step(twinSteps);
			cpu.step(twinSteps);
			const gs = await gpu.readState();
			let maxDh = 0, maxDq = 0;
			for (let i = 0; i < gs.length; i += 4) {
				maxDh = Math.max(maxDh, Math.abs(gs[i] - cpu.state[i]));
				maxDq = Math.max(maxDq, Math.abs(gs[i + 1] - cpu.state[i + 1]), Math.abs(gs[i + 2] - cpu.state[i + 2]));
			}
			say(`twin after ${twinSteps} steps: max|dh| = ${maxDh.toExponential(2)} m, max|dq| = ${maxDq.toExponential(2)} m2/s`);

			// 2. spin-up and record, with timing
			gpu.setDepth(depth);
			const t0 = performance.now();
			const dt = gpu.params.dt;
			gpu.step(Math.round(spinup / dt));
			await gpu.readState();
			const tSpin = performance.now() - t0;
			gpu.startStats();
			gpu.step(Math.round(record / dt));
			const stats = await gpu.readStats();
			const tAll = performance.now() - t0;
			const eta = await gpu.readEta();
			const foam = await gpu.readFoam();
			say(`spin-up ${spinup} s in ${tSpin.toFixed(0)} ms; total ${(spinup + record).toFixed(0)} s model in ${tAll.toFixed(0)} ms; ${stats.samples} samples`);
			say(`errors: ${errors.length ? errors.join('; ') : 'none'}`);
			(window as unknown as { __parity: unknown }).__parity = {
				scheme,
				dx,
				nx: grid.nx,
				ny: grid.ny,
				breaking: gpu.params,
				adapter: `${info.vendor} ${info.architecture} ${info.description}`,
				twin: { steps: twinSteps, maxDh, maxDq },
				spinup,
				record,
				dt,
				samples: stats.samples,
				wallMs: tAll,
				stepsPerSecond: Math.round((spinup + record) / dt / (tAll / 1000)),
				errors,
				Hs: Array.from(stats.Hs),
				foamMean: Array.from(stats.foamMean),
				foamFrac: Array.from(stats.foamFrac),
				eta: Array.from(eta),
				foam: Array.from(foam)
			};
			say('done');
		})().catch((e) => {
			say(`error: ${e}`);
			(window as unknown as { __parity: unknown }).__parity = { error: String(e) };
		});
	});
</script>

<pre>{log.join('\n')}</pre>

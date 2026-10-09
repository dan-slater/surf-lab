/**
 * Get a WebGPU device. requestAdapter can return null while the browser's GPU
 * process is still starting (seen in headless Chrome), so retry briefly.
 */
export async function requestDevice(tries = 5): Promise<{ adapter: GPUAdapter; device: GPUDevice }> {
	if (!navigator.gpu) throw new Error('WebGPU is not available in this browser (needs http(s) and a WebGPU build)');
	for (let i = 0; i < tries; i++) {
		const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
		if (adapter) {
			const device = await adapter.requestDevice();
			device.addEventListener('uncapturederror', (e) =>
				console.error('WebGPU:', (e as GPUUncapturedErrorEvent).error.message)
			);
			return { adapter, device };
		}
		await new Promise((r) => setTimeout(r, 400 * (i + 1)));
	}
	throw new Error('no WebGPU adapter');
}

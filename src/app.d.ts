// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {}
}

declare module '*.wgsl?raw' {
	const src: string;
	export default src;
}

export {};

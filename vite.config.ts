import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: { runes: true },
			// 404.html: Pages answers unknown paths with a real 404 instead of the
			// index at 200; absolute /_app/ paths so a deep 404 still boots
			adapter: adapter({ pages: 'build', assets: 'build', strict: true, fallback: '404.html' }),
			paths: { relative: false }
		})
	],
	// map-kit is consumed from its tagged source (src/lib); see src/lib/ui/README.md
	resolve: {
		alias: [
			{ find: /^@dan-slater\/map-kit$/, replacement: fileURLToPath(new URL('./node_modules/@dan-slater/map-kit/src/lib/index.ts', import.meta.url)) },
			{ find: /^@dan-slater\/map-kit\/(.*)$/, replacement: fileURLToPath(new URL('./node_modules/@dan-slater/map-kit/src/lib/', import.meta.url)) + '$1' }
		]
	},
	// the dev pre-bundler compiles map-kit's .svelte.ts files as plain JS and
	// fails on their types (v0.1.1's settings store); leave map-kit to the
	// normal Svelte + TS pipeline like app code
	optimizeDeps: { exclude: ['@dan-slater/map-kit'], include: ['@dan-slater/map-kit > maplibre-gl'] },
	server: { host: '127.0.0.1', port: 5181, strictPort: true }
});

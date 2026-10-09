import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: { runes: true },
			adapter: adapter({ pages: 'build', assets: 'build', strict: true })
		})
	],
	server: { host: '127.0.0.1', port: 5181, strictPort: true }
});

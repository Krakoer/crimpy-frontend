import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	ssr: {
		noExternal: ['@dnd-kit/svelte']
	},
	// Unit tests cover the plain logic modules under src/lib. Anything that needs
	// a browser is an end to end spec, matched by tests/*.e2e.ts in playwright.
	test: {
		include: ['src/**/*.test.ts']
	}
});

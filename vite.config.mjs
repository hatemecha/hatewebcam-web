import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Relative asset URLs work both in local preview and under /hatewebcam-web/.
  base: './',
  plugins: [svelte()],
});

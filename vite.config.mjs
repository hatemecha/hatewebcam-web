import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'node:url';

function editorEntryUrl() {
  const name = 'virtual:editor-entry-url';
  const id = `\0${name}`;
  const source = '/js/app/editor-install.ts';
  let building = false;

  return {
    name: 'hatewebcam-editor-entry-url',
    configResolved(config) {
      building = config.command === 'build';
    },
    resolveId(importId) {
      if (importId === name) return id;
    },
    load(importId) {
      if (importId !== id) return;
      if (!building) return `export default ${JSON.stringify(source)};`;
      const entry = fileURLToPath(new URL(`.${source}`, import.meta.url));
      const reference = this.emitFile({
        type: 'chunk',
        id: entry,
        name: 'editor-install',
        preserveSignature: 'strict',
      });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
  };
}

export default defineConfig({
  // Relative asset URLs work both in local preview and under /hatewebcam-web/.
  base: './',
  plugins: [svelte(), editorEntryUrl()],
});

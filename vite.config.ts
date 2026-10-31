import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./src/client', import.meta.url)),
  appType: 'mpa',
  build: {
    outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        host: fileURLToPath(new URL('./src/client/host/index.html', import.meta.url)),
        overlay: fileURLToPath(new URL('./src/client/overlay/index.html', import.meta.url)),
        episode: fileURLToPath(new URL('./src/client/episode/index.html', import.meta.url)),
        demo: fileURLToPath(new URL('./src/client/demo/index.html', import.meta.url))
      }
    }
  }
});

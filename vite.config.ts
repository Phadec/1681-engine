import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// `npm run dev` serves the examples; `npm run build` builds the library into dist/.
export default defineConfig({
  server: { host: '127.0.0.1', port: 5180 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    lib: {
      entry: { 'lantern-engine': resolve(import.meta.dirname, 'src/index.ts'), pixel: resolve(import.meta.dirname, 'src/pixel/index.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: [/^pixi\.js(\/.*)?$/],
    },
  },
  worker: { format: 'es' },
});

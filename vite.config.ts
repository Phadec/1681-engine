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
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'dither-engine.js',
    },
    rollupOptions: {
      external: [/^pixi\.js(\/.*)?$/],
    },
  },
  worker: { format: 'es' },
});

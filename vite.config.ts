import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// `npm run dev` serves the examples; `npm run build` builds the library into dist/.
export default defineConfig({
  // relative, so the bundled worker's URL is `./assets/…` beside the module: an absolute `/assets/…` sent a game's own
  // bundler looking for the worker at its site root (0.4.0, `Could not resolve entry module`)
  base: './',
  server: { host: '127.0.0.1', port: 5180 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    lib: {
      entry: { '1681-engine': resolve(import.meta.dirname, 'src/index.ts'), pixel: resolve(import.meta.dirname, 'src/pixel/index.ts'), ui: resolve(import.meta.dirname, 'src/ui/index.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: [/^pixi\.js(\/.*)?$/],
      // one file per source module, so a game's bundler keeps only what it imports: a worker that wants the colour
      // helpers of `pixel/pixel.ts` no longer takes Pixi, the audio engine and the rest of the bundle with it
      output: { preserveModules: true, preserveModulesRoot: 'src', entryFileNames: '[name].js' },
    },
  },
  worker: { format: 'es' },
});

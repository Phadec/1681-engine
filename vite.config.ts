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
    // no source maps in the package: they were 1.8 MB of its 2.9 MB unpacked, pointed at a src/ that is not published
    // (so useful only through their embedded copy of it), and the barrel entries' maps were empty. The modules stay
    // one file each with their whitespace kept, readable in a debugger as they are; ENGINE_SOURCEMAP=1 builds maps for
    // local work.
    sourcemap: process.env.ENGINE_SOURCEMAP === '1',
    lib: {
      entry: { '1681-engine': resolve(import.meta.dirname, 'src/index.ts'), pixel: resolve(import.meta.dirname, 'src/pixel/index.ts'), ui: resolve(import.meta.dirname, 'src/ui/index.ts'), react: resolve(import.meta.dirname, 'src/react/index.ts'), postfx: resolve(import.meta.dirname, 'src/postfx/index.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      // React is an optional peer of the `react` entry only: never bundled, the game brings its own copy
      external: [/^pixi\.js(\/.*)?$/, 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
      // one file per source module, so a game's bundler keeps only what it imports: a worker that wants the colour
      // helpers of `pixel/pixel.ts` no longer takes Pixi, the audio engine and the rest of the bundle with it
      output: { preserveModules: true, preserveModulesRoot: 'src', entryFileNames: '[name].js' },
    },
  },
  worker: { format: 'es' },
});

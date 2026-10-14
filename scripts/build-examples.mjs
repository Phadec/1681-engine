// Builds every example into docs/public/examples/<name>/ for the docs site, with the files they fetch at runtime.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dirname, '..', 'examples');
const out = resolve(import.meta.dirname, '..', 'docs', 'public', 'examples');
// the multiplayer and lobby examples need their servers; the site lists them but does not host them
const SERVED = new Set(['multiplayer', 'lobby']);
const names = readdirSync(root).filter((n) => existsSync(join(root, n, 'index.html')) && !SERVED.has(n));
rmSync(out, { recursive: true, force: true });
await build({
  root,
  base: './',
  logLevel: 'warn',
  configFile: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: Object.fromEntries(names.map((n) => [n, join(root, n, 'index.html')])) },
  },
});
for (const n of names) {
  const assets = join(root, n, 'assets');
  if (existsSync(assets)) cpSync(assets, join(out, n, 'assets'), { recursive: true });
}
console.log(`built ${names.length} examples into docs/public/examples: ${names.join(', ')}`);

// Gives every relative import in the emitted .d.ts files an explicit extension ('./x' → './x.js', './dir' →
// './dir/index.js'), as Node's ESM resolution (TypeScript's NodeNext) requires; bundler resolution accepts both.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist', 'types');
let fixed = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.d.ts')) fix(p);
  }
})(root);

function fix(file) {
  const src = readFileSync(file, 'utf8');
  // './x', '../x', and a bare '.' or '..' (TypeScript writes `import("..")` for a type it found in a parent index)
  const out = src.replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}(?:\/[^'"]*?)?)(['"])/g, (m, pre, spec, post) => {
    if (/\.(js|json)$/.test(spec)) return m;
    const target = resolve(dirname(file), spec);
    if (existsSync(target + '.d.ts')) return `${pre}${spec}.js${post}`;
    if (existsSync(join(target, 'index.d.ts'))) return `${pre}${spec}/index.js${post}`;
    throw new Error(`fix-dts-extensions: ${file} imports ${spec}, which has no declaration file`);
  });
  if (out !== src) {
    writeFileSync(file, out);
    fixed++;
  }
}
console.log(`fix-dts-extensions: ${fixed} declaration files given explicit extensions`);

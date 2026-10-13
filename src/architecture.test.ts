import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The core is for 2D games in any art style; the pixel-art module builds on it, never the other way round.
const src = dirname(fileURLToPath(import.meta.url));
const pixelDir = join(src, 'pixel') + sep;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('nothing outside src/pixel imports from it', () => {
  const offenders: string[] = [];
  for (const file of files(src)) {
    if (file.startsWith(pixelDir)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), m[1]!);
      if ((target + sep).startsWith(pixelDir) || target.startsWith(pixelDir)) offenders.push(`${relative(src, file)} → ${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'the core must not depend on the pixel module');
});

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// The core is for 2D games in any art style; the pixel-art module builds on it, never the other way round.
const src = dirname(fileURLToPath(import.meta.url));
const pixelDir = join(src, 'pixel') + sep;
const reactDir = join(src, 'react') + sep;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
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

// React is an optional peer of `1681-engine/react` only: the core, the canvas UI and the pixel module run without it.
test('nothing outside src/react imports React or the React kit', () => {
  const offenders: string[] = [];
  for (const file of files(src)) {
    if (file.startsWith(reactDir)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from\s+|import\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
      const spec = m[1]!;
      const isReact = /^(react|react-dom)(\/.*)?$/.test(spec);
      const target = spec.startsWith('.') ? resolve(dirname(file), spec) : '';
      const isKit = target !== '' && ((target + sep).startsWith(reactDir) || target.startsWith(reactDir));
      if (isReact || isKit) offenders.push(`${relative(src, file)} → ${spec}`);
    }
    if (file.endsWith('.tsx')) offenders.push(`${relative(src, file)} is JSX outside src/react`);
  }
  assert.deepEqual(offenders, [], 'only src/react may depend on React');
});

// The engine knows no game: a game's names, its data and its language stay in the game, and what differs between
// games is a parameter or something the game registers (`registerMaterial`, `registerHandRamps`, `registerSounds`…).
const GAME_WORDS = /\b(zero ?to ?hero|eldmoor|dunmarch|hollowfen|voorn|aldermark|marches|tpkl|gamedata|@game\/)/i;
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

test('the engine names no game and speaks no game language', () => {
  const offenders: string[] = [];
  for (const file of files(src)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (file.endsWith('architecture.test.ts')) return;
      if (GAME_WORDS.test(line) || VIETNAMESE.test(line)) offenders.push(`${relative(src, file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], 'move it into the game, or make it a parameter the game passes');
});

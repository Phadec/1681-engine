// Runs every src/**/*.test.ts under node's test runner. The file list is found here because `node --test` only
// expands glob patterns itself from Node 21, and the engine supports Node 20.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.test.ts')) files.push(relative(root, p));
  }
})(join(root, 'src'));
files.sort();
const run = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2), ...files], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 1);

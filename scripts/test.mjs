// Runs every src/**/*.test.ts (and .test.tsx) under node's test runner, with the file list found here rather than left to a glob
// pattern, whose expansion differs between Node versions and shells.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) files.push(relative(root, p));
  }
})(join(root, 'src'));
files.sort();
const run = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2), ...files], { cwd: root, stdio: 'inherit' });
process.exit(run.status ?? 1);

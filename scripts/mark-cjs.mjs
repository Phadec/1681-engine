// Marks dist/cjs as CommonJS: the package is `"type": "module"`, so without this Node (and TypeScript) would read the
// `.js` and `.d.ts` files tsconfig.cjs.json wrote there as ES modules.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

writeFileSync(join(import.meta.dirname, '..', 'dist', 'cjs', 'package.json'), '{ "type": "commonjs" }\n');
console.log('mark-cjs: dist/cjs marked CommonJS');

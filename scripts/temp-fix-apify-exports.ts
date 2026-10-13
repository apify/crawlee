import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const target = resolve(process.cwd(), 'dist', 'index.d.ts');

const file = readFileSync(target).toString();

writeFileSync(target, file.replace(`export * from './exports';`, `// @ts-ignore\nexport * from './exports';`));

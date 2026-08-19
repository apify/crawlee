import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distPath = fileURLToPath(new URL('../dist', import.meta.url));

mkdirSync(distPath, { recursive: true });
cpSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), fileURLToPath(new URL('../dist/manifest.json', import.meta.url)));
cpSync(fileURLToPath(new URL('../templates', import.meta.url)), fileURLToPath(new URL('../dist/templates', import.meta.url)), {
    recursive: true,
});

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
    'puppeteer/puppeteer-proxy-per-page.d.ts',
];

for (const file of files) {
    copyFileSync(
        join('src', file),
        join('dist', file),
    );
}

import { readFileSync, writeFileSync } from 'fs';

import { globby } from 'globby';

const files = await globby('packages/*/dist/**/*.d.ts');

// fix types references
for (const filepath of files) {
    const input = readFileSync(filepath, { encoding: 'utf8' }).split('\n');
    const output = [];
    let changed = false;
    let match;

    for (const line of input) {
        /* eslint-disable no-cond-assign */
        if ((match = line.match(/^([^']+)'node\/([^$]+)/))) {
            output.push(`${match[1]} '${match[2]}`);
            changed = true;
        } else if (
            // playwright/puppeteer/got-scraping import
            line.match(/^([^']+)'(playwright|puppeteer|got-scraping)'/) ||
            // proxy-per-page reexport of puppeteer
            line.match(/: Puppeteer\.\w+/) ||
            // don't ask me why, but this one is needed too ¯\_(ツ)_/¯
            line.match(/^export interface (PlaywrightHook|PuppeteerHook)/) ||
            // adaptive crawler needs router override that is incompatible with the base type
            line.match(/readonly router: RouterHandler<AdaptivePlaywrightCrawlerContext>/) ||
            // /// <reference types="something" /> from newer nodenext resolutions
            line.match(/^\/\/\/ <reference types="[^"]+" \/>/) ||
            // import("something") from compatibility with ES2022 module -.-
            line.match(/import\("([^"]+)"(?:.*)?\)/)
        ) {
            output.push('// @ts-ignore optional peer dependency or compatibility with es2022');
            output.push(line);
            changed = true;
        } else {
            output.push(line);
        }
        /* eslint-enable no-cond-assign */
    }

    if (changed === true) {
        console.log('Writing', filepath);
        writeFileSync(filepath, output.join('\n'));
    }
}

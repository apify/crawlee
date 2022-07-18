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
        if (match = line.match(/^([^']+)'node\/([^$]+)/)) {
            output.push(`${match[1]} '${match[2]}`);
            changed = true;
        } else if (
            // playwright/puppeteer import
            line.match(/^([^']+)'(playwright|puppeteer)'/) ||
            // proxy-per-page reexport of puppeteer
            line.match(/: Puppeteer\.\w+/) ||
            // don't ask me why, but this one is needed too ¯\_(ツ)_/¯
            line.match(/^export declare type (PlaywrightHook|PuppeteerHook|PlaywrightCookie)/)
        ) {
            output.push('// @ts-ignore optional peer dependency');
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

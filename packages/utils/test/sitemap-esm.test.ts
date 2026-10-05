import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('parses XML sitemaps with the native Node ESM loader', async () => {
    // Vitest synthesizes CJS named exports; a child process loads `sax` the way Node does for users.
    const root = resolve(__dirname, '../../..');
    const { stdout } = await promisify(execFile)(
        process.execPath,
        [
            '--import',
            'tsx',
            '--input-type=module',
            '--eval',
            `
                import { Sitemap } from './packages/utils/src/index.ts';
                const sitemap = await Sitemap.fromXmlString(
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/catalog?item=1&amp;lang=en</loc></url></urlset>',
                );
                process.stdout.write(JSON.stringify(sitemap.urls));
            `,
        ],
        { cwd: root },
    );

    expect(JSON.parse(stdout)).toEqual(['https://example.com/catalog?item=1&lang=en']);
});

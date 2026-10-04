import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

it('parses XML sitemaps with the native Node ESM loader', async () => {
    // Vitest synthesizes CJS named exports; a child process exercises the built package as users load it.
    const { stdout } = await promisify(execFile)(
        process.execPath,
        [
            '--input-type=module',
            '--eval',
            `
                import { Sitemap } from '@crawlee/utils';
                const sitemap = await Sitemap.fromXmlString(
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/catalog?item=1&amp;lang=en</loc></url></urlset>',
                );
                process.stdout.write(JSON.stringify(sitemap.urls));
            `,
        ],
        { cwd: resolve(__dirname, '../../..') },
    );

    expect(JSON.parse(stdout)).toEqual(['https://example.com/catalog?item=1&lang=en']);
});

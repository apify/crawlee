import { readdir } from 'node:fs/promises';
import { copy } from 'fs-extra';

const templates = await readdir('./templates');

await copy('./manifest.json', './dist/manifest.json', { override: true });
console.info(`Successfully copied 'manifest.json' to dist`);

const ignoreFolders = ['node_modules', 'dist', 'crawlee_storage', 'storage', 'apify_storage', 'package-lock.json'];

for (const tpl of templates) {
    console.info(tpl);
    await copy(`./templates/${tpl}`, `./dist/templates/${tpl}`, {
        override: true,
        filter: (src) => !ignoreFolders.some(f => src.includes(f)),
    });
    console.info(`Successfully copied '${tpl}' template to dist`);
}

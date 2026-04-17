import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Docusaurus' typedoc plugin walks up from external symbols to find a package.json
// then loads its README. With pnpm's nested node_modules (peer dep conflicts on
// inquirer/wrap-ansi/etc.), it picks up package READMEs that contain HTML the MDX
// loader can't parse. Yarn's hoisting flattened these out — emulate that by
// removing top-level docs from any package nested under packages/*/node_modules.

const targets = new Set(['README.md', 'readme.md', 'CHANGELOG.md', 'changelog.md']);

async function walk(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            // package root — clean docs and stop descending
            await Promise.all([...targets].map((name) => rm(join(full, name), { force: true })));
            // recurse into scoped packages (@scope/*) and nested node_modules
            if (entry.name.startsWith('@')) {
                await walk(full);
            } else {
                const nested = join(full, 'node_modules');
                try {
                    await stat(nested);
                    await walk(nested);
                } catch {
                    // no nested node_modules, skip
                }
            }
        }
    }
}

const root = new URL('../packages/', import.meta.url).pathname;
const packages = await readdir(root, { withFileTypes: true });
await Promise.all(packages.filter((e) => e.isDirectory()).map((e) => walk(join(root, e.name, 'node_modules'))));

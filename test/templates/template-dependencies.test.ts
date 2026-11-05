import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { satisfies } from 'semver';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const templatesDir = resolve(import.meta.dirname, '../../packages/templates/templates');
const { version } = readJson(resolve(import.meta.dirname, '../../packages/crawlee/package.json'));

describe('project templates', () => {
    test.each(readdirSync(templatesDir))('%s depends on the current crawlee version', (template) => {
        const { dependencies } = readJson(resolve(templatesDir, template, 'package.json'));

        for (const [name, range] of Object.entries<string>(dependencies)) {
            if (name === 'crawlee' || name.startsWith('@crawlee/')) {
                expect(satisfies(version, range), `${name}@${range}`).toBe(true);
            }
        }
    });
});

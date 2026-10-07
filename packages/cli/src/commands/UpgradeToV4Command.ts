import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { CommandModule } from 'yargs';

export class UpgradeToV4Command implements CommandModule {
    command = 'upgrade-to-v4';
    describe = 'Prints an AI prompt for migrating a Crawlee project from v3 to v4';

    async handler() {
        const skillUrl = new URL('../skills/crawlee-upgrade-v4/', import.meta.url);
        const skillRoot = fileURLToPath(skillUrl).replace(/\\/g, '/').replace(/\/$/, '');
        const prompt = await readFile(new URL('SKILL.md', skillUrl), 'utf8');

        process.stdout.write(prompt.replaceAll('{SKILL_ROOT}', () => skillRoot));
    }
}

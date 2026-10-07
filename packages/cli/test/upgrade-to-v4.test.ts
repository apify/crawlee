import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cliRoot = fileURLToPath(new URL('../', import.meta.url));
const projectRoot = resolve(cliRoot, '../..');
const sourceSkill = join(cliRoot, 'src/skills/crawlee-upgrade-v4');
let temporaryRoot: string;

beforeAll(async () => {
    temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'crawlee upgrade $& ')));
});

afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

async function checkPrompt(output: string, skillRoot: string) {
    const template = await readFile(join(sourceSkill, 'SKILL.md'), 'utf8');
    const renderedRoot = skillRoot.replace(/\\/g, '/');
    expect(output).toBe(template.replaceAll('{SKILL_ROOT}', () => renderedRoot));

    const paths = [...output.matchAll(/\]\(<([^>]+\/references\/[^>]+)>\)/g)].map((match) => match[1]);
    const references = await readdir(join(skillRoot, 'references'));
    expect(new Set(paths).size).toBe(references.length);
    for (const path of paths) {
        expect((await readFile(path, 'utf8')).length).toBeGreaterThan(0);
    }
}

describe('upgrade-to-v4', () => {
    it('prints the source skill with readable absolute references from another working directory', async () => {
        const output = execFileSync(
            process.execPath,
            ['--import', 'tsx', join(cliRoot, 'src/index.ts'), 'upgrade-to-v4'],
            { cwd: projectRoot, encoding: 'utf8' },
        );
        expect(output).not.toContain('{SKILL_ROOT}');
        await checkPrompt(output, sourceSkill);
    });

    it('copies all skill assets and resolves them in the published layout, including special path characters', async () => {
        const packageRoot = join(temporaryRoot, 'package');
        await cp(join(cliRoot, 'scripts'), join(packageRoot, 'scripts'), { recursive: true });
        await cp(join(cliRoot, 'src/skills'), join(packageRoot, 'src/skills'), { recursive: true });
        execFileSync(process.execPath, [join(packageRoot, 'scripts/copy-skills.mjs')], { cwd: temporaryRoot });
        await rm(join(packageRoot, 'src'), { recursive: true });

        const command = await readFile(join(cliRoot, 'src/commands/UpgradeToV4Command.ts'), 'utf8');
        const ts = await import('typescript-v6');
        const { outputText } = ts.transpileModule(command, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        });
        const commandPath = join(packageRoot, 'dist/commands/UpgradeToV4Command.mjs');
        await mkdir(join(packageRoot, 'dist/commands'), { recursive: true });
        await writeFile(commandPath, outputText);

        const output = execFileSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                'const m = await import(process.argv[1]); await new m.UpgradeToV4Command().handler();',
                pathToFileURL(commandPath).href,
            ],
            { cwd: temporaryRoot, encoding: 'utf8' },
        );
        expect(output).not.toContain('{SKILL_ROOT}');
        await checkPrompt(output, join(packageRoot, 'dist/skills/crawlee-upgrade-v4'));
    });
});

import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
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
    it('forwards release flags to the metadata copy script while bundling skill assets', async () => {
        const workspaceRoot = join(temporaryRoot, 'release');
        const packageRoot = join(workspaceRoot, 'packages/cli');
        await mkdir(join(workspaceRoot, 'scripts'), { recursive: true });
        await mkdir(packageRoot, { recursive: true });
        await cp(join(projectRoot, 'scripts/copy.ts'), join(workspaceRoot, 'scripts/copy.ts'));
        await cp(join(cliRoot, 'package.json'), join(packageRoot, 'package.json'));
        await cp(join(cliRoot, 'scripts'), join(packageRoot, 'scripts'), { recursive: true });
        await cp(join(cliRoot, 'src/skills'), join(packageRoot, 'src/skills'), { recursive: true });
        await symlink(join(projectRoot, 'node_modules'), join(workspaceRoot, 'node_modules'), 'junction');
        await writeFile(join(workspaceRoot, 'package.json'), JSON.stringify({ type: 'module' }));
        await writeFile(join(workspaceRoot, 'lerna.json'), JSON.stringify({ version: '4.0.0' }));
        await writeFile(
            join(workspaceRoot, 'pnpm-workspace.yaml'),
            'packages:\n  - packages/*\nverifyDepsBeforeRun: false\n',
        );
        await writeFile(join(workspaceRoot, 'README.md'), 'Fixture');
        await writeFile(join(workspaceRoot, 'LICENSE.md'), 'Fixture');

        execFileSync('pnpm', ['run', 'copy', '--pin-versions'], { cwd: packageRoot, encoding: 'utf8' });

        const manifest = JSON.parse(await readFile(join(packageRoot, 'dist/package.json'), 'utf8'));
        expect(manifest.dependencies['@crawlee/templates']).toBe('4.0.0');
        expect(await readFile(join(packageRoot, 'dist/skills/crawlee-upgrade-v4/SKILL.md'), 'utf8')).toBe(
            await readFile(join(sourceSkill, 'SKILL.md'), 'utf8'),
        );
    });

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

import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const cliRoot = resolve(projectRoot, 'packages/cli');
const sourceSkill = join(cliRoot, 'src/skills/crawlee-upgrade-v4');
let temporaryRoot: string;
let commandPath: string;
let bundledSkills: string;
const require = createRequire(import.meta.url);

beforeAll(async () => {
    temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), 'crawlee upgrade $& ')));
    await symlink(join(projectRoot, 'node_modules'), join(temporaryRoot, 'node_modules'), 'junction');
    const packageRoot = join(temporaryRoot, 'package');
    await cp(join(cliRoot, 'scripts'), join(packageRoot, 'scripts'), { recursive: true });
    await cp(join(cliRoot, 'src/skills'), join(packageRoot, 'src/skills'), { recursive: true });
    execFileSync(process.execPath, [join(packageRoot, 'scripts/copy-skills.mjs')], { cwd: temporaryRoot });
    await rm(join(packageRoot, 'src'), { recursive: true });
    bundledSkills = join(packageRoot, 'dist/skills');

    const command = await readFile(join(cliRoot, 'src/commands/upgrade-command.ts'), 'utf8');
    const ts = await import('typescript-v6');
    const { outputText } = ts.transpileModule(command, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    commandPath = join(packageRoot, 'dist/commands/upgrade-command.mjs');
    await mkdir(join(packageRoot, 'dist/commands'), { recursive: true });
    await writeFile(commandPath, outputText);
});

afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

async function checkPrompt(output: string, skillRoot: string) {
    const template = await readFile(join(sourceSkill, 'SKILL.md'), 'utf8');
    const renderedRoot = skillRoot.replace(/\\/g, '/');
    expect(output).toContain(
        template
            .slice(template.indexOf('# Upgrade Crawlee'))
            .trim()
            .replaceAll('{SKILL_ROOT}', () => renderedRoot),
    );
    expect(output).toContain('# Crawlee upgrade plan: v3 to v4');
    expect(output).toContain('1. Upgrade v3 to v4, then verify before continuing.');
    expect(output).not.toMatch(/\{(?:SKILL_ROOT|FROM_MAJOR|TO_MAJOR|MIGRATION_PLAN|MIGRATION_GUIDES)\}/);

    const paths = [...output.matchAll(/\]\(<([^>]+\/references\/[^>]+)>\)/g)].map((match) => match[1]);
    const references = await readdir(join(skillRoot, 'references'));
    expect(new Set(paths).size).toBe(references.length);
    for (const path of paths) {
        expect((await readFile(path, 'utf8')).length).toBeGreaterThan(0);
    }
}

async function project(manifest: object) {
    const directory = await mkdtemp(join(temporaryRoot, 'project-'));
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    return directory;
}

function runUpgrade(options: { from?: number; to?: number; export?: string } = {}, cwd = temporaryRoot) {
    return spawnSync(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            'const m = await import(process.argv[1]); await new m.UpgradeCommand().handler(JSON.parse(process.argv[2]));',
            pathToFileURL(commandPath).href,
            JSON.stringify(options),
        ],
        { cwd, encoding: 'utf8' },
    );
}

describe('upgrade', () => {
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
        const cwd = await project({ dependencies: { crawlee: '^3.15.0' } });
        const output = execFileSync(
            process.execPath,
            ['--import', require.resolve('tsx'), join(cliRoot, 'src/index.ts'), 'upgrade', '--to', '4'],
            { cwd, encoding: 'utf8' },
        );
        expect(output).not.toContain('{SKILL_ROOT}');
        await checkPrompt(output, sourceSkill);
    });

    it('copies all skill assets and resolves them in the published layout, including special path characters', async () => {
        const result = runUpgrade({ from: 3 });
        expect(result.status, result.stderr).toBe(0);
        await checkPrompt(result.stdout, join(bundledSkills, 'crawlee-upgrade-v4'));
    });

    it.each([
        ['dependencies', '@crawlee/cheerio'],
        ['devDependencies', '@crawlee/cheerio'],
        ['optionalDependencies', '@crawlee/cheerio'],
        ['peerDependencies', '@crawlee/cheerio'],
        ['dependencies', '@crawlee/browser-pool'],
    ])('detects scoped Crawlee packages in %s (%s) from a nested working directory', async (section, name) => {
        const cwd = await project({ [section]: { [name]: '~3.15.0' } });
        await mkdir(join(cwd, 'src'));
        const result = runUpgrade({}, join(cwd, 'src'));
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('# Crawlee upgrade plan: v3 to v4');
    });

    it('copies the guides to --export and links the prompt to that copy', async () => {
        const exportDirectory = join(await mkdtemp(join(temporaryRoot, 'export-')), 'guides');
        const result = runUpgrade({ from: 3, export: exportDirectory });
        expect(result.status, result.stderr).toBe(0);
        await checkPrompt(result.stdout, join(exportDirectory, 'crawlee-upgrade-v4'));
        expect(result.stdout).not.toContain(bundledSkills.replace(/\\/g, '/'));
    });

    it.each([
        ['a non-semver specifier', 'latest', '3.18.2'],
        ['an installed version outside the declared range', '^3.15.0', '4.0.0'],
    ])('resolves %s from what is declared and installed', async (_, specifier, installed) => {
        const cwd = await project({ dependencies: { crawlee: specifier } });
        await mkdir(join(cwd, 'node_modules/crawlee'), { recursive: true });
        await writeFile(
            join(cwd, 'node_modules/crawlee/package.json'),
            JSON.stringify({ name: 'crawlee', version: installed }),
        );
        const result = runUpgrade({}, cwd);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('# Crawlee upgrade plan: v3 to v4');
    });

    it('uses the installed project version for a range spanning several majors', async () => {
        const cwd = await project({ dependencies: { crawlee: '>=3 <5' } });
        await mkdir(join(cwd, 'node_modules/crawlee'), { recursive: true });
        await writeFile(
            join(cwd, 'node_modules/crawlee/package.json'),
            JSON.stringify({ name: 'crawlee', version: '3.18.2' }),
        );
        const result = runUpgrade({}, cwd);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('# Crawlee upgrade plan: v3 to v4');
    });

    it.each([
        [{ dependencies: { crawlee: '3 || 5' } }, 'Cannot determine'],
        [{ dependencies: { crawlee: '^3', '@crawlee/core': '^4' } }, 'different majors'],
        [{ devDependencies: { '@crawlee/cli': '^4' } }, 'No Crawlee runtime dependency'],
        [{ dependencies: { crawlee: '4.0.0-rc.1' } }, 'already on Crawlee v4'],
    ])('rejects unresolved or already-current project versions: %j', async (manifest, message) => {
        const result = runUpgrade({}, await project(manifest));
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(message);
    });

    it.each([
        { from: 4, to: 4 },
        { from: 4, to: 3 },
    ])('rejects an explicit target that is not newer: %j', (options) => {
        const result = runUpgrade(options);
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('already on Crawlee v4');
    });

    it('prints only the error message when detection fails through the CLI entry', async () => {
        const cwd = await project({ devDependencies: { '@crawlee/cli': '^4' } });
        const result = spawnSync(
            process.execPath,
            ['--import', require.resolve('tsx'), join(cliRoot, 'src/index.ts'), 'upgrade'],
            { cwd, encoding: 'utf8' },
        );
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('No Crawlee runtime dependency');
        expect(result.stderr).not.toContain('Usage:');
        expect(result.stderr).not.toContain('    at ');
    });

    it('lets --from override ambiguous project metadata', async () => {
        const result = runUpgrade({ from: 3 }, await project({ dependencies: { crawlee: 'latest' } }));
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('# Crawlee upgrade plan: v3 to v4');
    });

    it('does not infer a project version from the invoked CLI when no manifest exists', () => {
        const result = runUpgrade();
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('No project package.json');
    });

    it.each([{ from: 0 }, { from: 3, to: 4.5 }, { from: 3, to: 0 }])(
        'rejects invalid major versions: %j',
        (options) => {
            const result = runUpgrade(options);
            expect(result.status).not.toBe(0);
            expect(result.stdout).toBe('');
            expect(result.stderr).toContain('positive major version');
        },
    );

    it('rejects an unsupported destination before printing any migration', () => {
        const result = runUpgrade({ from: 3, to: 5 });
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('No bundled migration from v4 to v5');
    });

    it('composes future major guides in order, defaulting to the newest bundled target', async () => {
        const futureSkill = join(bundledSkills, 'crawlee-upgrade-v5');
        await mkdir(futureSkill);
        await writeFile(
            join(futureSkill, 'SKILL.md'),
            '---\nname: future-fixture\n---\n# Upgrade v4 to v5\nRead {SKILL_ROOT}/references/future.md',
        );
        try {
            const result = runUpgrade({ from: 3 });
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toContain('# Crawlee upgrade plan: v3 to v5');
            expect(result.stdout).toContain(
                '1. Upgrade v3 to v4, then verify before continuing.\n2. Upgrade v4 to v5, then verify before continuing.',
            );
            expect(result.stdout.indexOf('# Upgrade Crawlee from v3 to v4')).toBeLessThan(
                result.stdout.indexOf('# Upgrade v4 to v5'),
            );
            expect(result.stdout).toContain(futureSkill.replace(/\\/g, '/'));
            expect(result.stdout).not.toContain('{SKILL_ROOT}');
            expect(result.stdout).not.toContain('name: future-fixture');

            const single = runUpgrade({ from: 3, to: 4 });
            expect(single.status, single.stderr).toBe(0);
            expect(single.stdout).not.toContain('# Upgrade v4 to v5');

            const missing = runUpgrade({ from: 2, to: 5 });
            expect(missing.status).not.toBe(0);
            expect(missing.stdout).toBe('');
            expect(missing.stderr).toContain('No bundled migration from v2 to v3');
        } finally {
            await rm(futureSkill, { recursive: true });
        }
    });
});

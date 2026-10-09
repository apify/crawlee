import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, expect, it } from 'vitest';

let temporaryRoot: string;
let launcher: string;
let projectRoot: string;

beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'crawlee-launcher-'));
    const packageRoot = join(temporaryRoot, 'invoked');
    projectRoot = join(temporaryRoot, 'project');
    const cliDependency = join(packageRoot, 'node_modules/@crawlee/cli');
    const localPackage = join(projectRoot, 'node_modules/crawlee');
    await mkdir(cliDependency, { recursive: true });
    await mkdir(localPackage, { recursive: true });
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'crawlee', type: 'module' }));
    await writeFile(join(cliDependency, 'package.json'), JSON.stringify({ type: 'module', main: 'index.js' }));
    await writeFile(join(cliDependency, 'index.js'), "console.log('invoked CLI');\n");
    await writeFile(join(localPackage, 'package.json'), JSON.stringify({ name: 'crawlee', version: '3.15.0' }));
    await writeFile(join(localPackage, 'cli.js'), "console.log('project-local CLI');\n");

    const require = createRequire(new URL('../../crawlee/package.json', import.meta.url));
    await symlink(dirname(require.resolve('import-local')), join(packageRoot, 'node_modules/import-local'), 'junction');
    const source = await readFile(new URL('../../crawlee/src/cli.ts', import.meta.url), 'utf8');
    const ts = await import('typescript-v6');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    launcher = join(packageRoot, 'cli.js');
    await writeFile(launcher, outputText);
});

afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

it.each([['upgrade'], ['--help', 'upgrade'], ['upgrade', '--from', '3', '--to', '4']])(
    'uses the invoked CLI for %j even when an older project-local CLI exists',
    (...args) => {
        const output = execFileSync(process.execPath, [launcher, ...args], { cwd: projectRoot, encoding: 'utf8' });
        expect(output).toBe('invoked CLI\n');
    },
);

it('keeps project-local delegation for other commands', () => {
    const output = execFileSync(process.execPath, [launcher, 'run'], { cwd: projectRoot, encoding: 'utf8' });
    expect(output).toBe('project-local CLI\n');
});

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../..');
const tsxRegister = require.resolve('tsx/cjs');
const cliEntry = join(repoRoot, 'packages/cli/src/index.ts');

let temporaryRoot: string;
let fakeBin: string;
let emptyBin: string;
let recordedArgs: string;

function runCli(args: string[], env: NodeJS.ProcessEnv) {
    return spawnSync(process.execPath, ['--require', tsxRegister, cliEntry, ...args], {
        // tsx resolves the workspace `paths` from the tsconfig in the cwd
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
}

beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'crawlee-upgrade-'));
    fakeBin = join(temporaryRoot, 'bin');
    emptyBin = join(temporaryRoot, 'empty');
    recordedArgs = join(temporaryRoot, 'args.json');
    await mkdir(fakeBin);
    await mkdir(emptyBin);

    const fakeNpx = join(fakeBin, 'npx');
    await writeFile(
        fakeNpx,
        [
            `#!${process.execPath}`,
            `require('node:fs').writeFileSync(${JSON.stringify(recordedArgs)}, JSON.stringify({ args: process.argv.slice(2), handover: process.env.CRAWLEE_UPGRADE_HANDOVER }));`,
            `console.log('fake latest CLI');`,
            `process.exit(Number(process.env.FAKE_NPX_EXIT_CODE ?? 0));`,
        ].join('\n'),
    );
    await chmod(fakeNpx, 0o755);
});

afterEach(async () => {
    await rm(recordedArgs, { force: true });
});

afterAll(async () => {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('crawlee upgrade', () => {
    it('hands over to the latest CLI and forwards the arguments', async () => {
        const args = ['--from', '3', '--to=4', '--export', 'some dir/skill'];
        const result = runCli(['upgrade', ...args], { PATH: `${fakeBin}${delimiter}${process.env.PATH}` });

        expect(result.stderr).not.toContain('Unknown argument');
        expect(result.stdout).toContain('fake latest CLI');
        expect(result.status).toBe(0);
        expect(JSON.parse(await readFile(recordedArgs, 'utf8'))).toEqual({
            args: ['crawlee@latest', 'upgrade', ...args],
            handover: '1',
        });
    });

    it('propagates the exit code of the latest CLI', () => {
        const result = runCli(['upgrade'], {
            PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
            FAKE_NPX_EXIT_CODE: '3',
        });

        expect(result.status).toBe(3);
        expect(result.stderr).not.toContain('Usage: crawlee');
    });

    it('does not spawn again when the latest CLI is this same command', () => {
        const result = runCli(['upgrade'], {
            PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
            CRAWLEE_UPGRADE_HANDOVER: '1',
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('does not have the `upgrade` command yet');
        expect(result.stdout).not.toContain('fake latest CLI');
        expect(existsSync(recordedArgs)).toBe(false);
    });

    it('tells the user to run the latest CLI themselves when `npx` cannot be spawned', () => {
        const result = runCli(['upgrade'], { PATH: emptyBin });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('npx crawlee@latest upgrade');
        expect(result.stderr).not.toContain('Usage: crawlee');
        expect(result.stdout).not.toContain('Usage: crawlee');
    });
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { execSyncMock, httpsGetMock } = vi.hoisted(() => ({
    execSyncMock: vi.fn(),
    httpsGetMock: vi.fn(() => {
        throw new Error('Unexpected network access');
    }),
}));

vi.mock('node:child_process', () => ({
    execSync: execSyncMock,
}));

vi.mock('node:https', () => ({
    default: {
        get: httpsGetMock,
    },
    get: httpsGetMock,
}));

import { CreateProjectCommand } from '../src/commands/CreateProjectCommand';

describe('CreateProjectCommand', () => {
    const originalCwd = process.cwd();
    let workspaceDir: string;

    beforeEach(async () => {
        workspaceDir = await mkdtemp(join(tmpdir(), 'crawlee-create-project-'));
        process.chdir(workspaceDir);
        execSyncMock.mockReset();
        httpsGetMock.mockClear();
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await rm(workspaceDir, { recursive: true, force: true });
    });

    test('creates a project from packaged templates without network access', async () => {
        const command = new CreateProjectCommand();

        await command.handler({
            projectName: 'my-project',
            template: 'empty-js',
        } as any);

        expect(httpsGetMock).not.toHaveBeenCalled();
        expect(execSyncMock).toHaveBeenCalledTimes(1);
        expect(execSyncMock).toHaveBeenCalledWith(expect.stringMatching(/^npm(?:\.cmd)? install$/), {
            cwd: join(workspaceDir, 'my-project'),
            stdio: 'inherit',
        });

        const packageJson = await readFile(join(workspaceDir, 'my-project', 'package.json'), 'utf8');
        expect(packageJson).toContain('"name": "my-project"');
    });
});

import { exec } from 'node:child_process';
import path from 'node:path';

import { psTree } from '../../packages/utils/src/internals/system-info/ps-tree.js';

const scripts = {
    parent: path.join(import.meta.dirname, 'fixtures', 'parent.js'),
    child: path.join(import.meta.dirname, 'fixtures', 'child.js'),
};

describe('psTree()', () => {
    test('Spawn a Parent process which has Ten Child Processes', async () => {
        const parent = exec(`node ${scripts.parent}`);

        // Wait for the child process(es) to spawn.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const children = await psTree(parent.pid!);

        expect(children.length).toBeGreaterThan(0);

        // Allow time for the processes to be terminated.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const postKillChildren = await psTree(parent.pid!);

        expect(postKillChildren.length).toEqual(0);
    });

    test('Includes itself if includeRoot is true', async () => {
        const parent = exec(`node ${scripts.parent}`);

        // Wait for the child process(es) to spawn.
        await new Promise((resolve) => setTimeout(resolve, 500));

        const processes = await psTree(parent.pid!, true);

        const parentProcess = processes.find((process) => Number.parseInt(process.PID, 10) === parent.pid!);

        expect(parentProcess).toBeDefined();

        // Allow time for the processes to be terminated.
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const postKillChildren = await psTree(parent.pid!);

        expect(postKillChildren.length).toEqual(0);
    });
});

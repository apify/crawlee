import { exec } from 'node:child_process';
import path from 'node:path';

import { psTree } from '../../packages/utils/src/internals/systemInfoV2/ps-tree';

const scripts = {
    parent: path.join(__dirname, 'fixtures', 'parent.js'),
    child: path.join(__dirname, 'fixtures', 'child.js'),
};

// Helper to poll for a condition on process tree
async function waitForCondition(
    pid: number,
    condition: (children: any[]) => boolean,
    maxWaitMs = 3000,
): Promise<any[]> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
        const children = await psTree(pid);
        if (condition(children)) {
            return children;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return psTree(pid); // Final attempt
}

describe('psTree()', () => {
    test('Spawn a Parent process which has Ten Child Processes', async () => {
        const parent = exec(`node ${scripts.parent}`);

        // Poll until child processes are detected
        const children = await waitForCondition(parent.pid!, (c) => c.length > 0);

        expect(children.length).toBeGreaterThan(0);

        // Poll until processes terminate
        await waitForCondition(parent.pid!, (c) => c.length === 0, 10000);

        const postKillChildren = await psTree(parent.pid!);

        expect(postKillChildren.length).toEqual(0);
    });

    test('Includes itself if includeRoot is true', async () => {
        const parent = exec(`node ${scripts.parent}`);

        // Poll until processes are detected (parent + at least one child)
        await waitForCondition(parent.pid!, (c) => c.length > 1, 3000);

        // Get processes with includeRoot after waiting
        const processesWithRoot = await psTree(parent.pid!, true);
        const parentProcess = processesWithRoot.find((process) => Number.parseInt(process.PID, 10) === parent.pid!);

        expect(parentProcess).toBeDefined();

        // Poll until processes terminate
        await waitForCondition(parent.pid!, (c) => c.length === 0, 10000);

        const postKillChildren = await psTree(parent.pid!);

        expect(postKillChildren.length).toEqual(0);
    });
});

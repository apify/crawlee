/* eslint-disable no-loop-func */
import { execSync } from 'node:child_process';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread, Worker, workerData } from 'node:worker_threads';

import { colors, getApifyToken, clearPackages, clearStorage, SKIPPED_TEST_CLOSE_CODE } from './tools.mjs';

const basePath = dirname(fileURLToPath(import.meta.url));

process.env.APIFY_TOKEN ??= await getApifyToken();
process.env.APIFY_CONTAINER_URL ??= 'http://127.0.0.1';
process.env.APIFY_CONTAINER_PORT ??= '8000';

/**
 * Depending on STORAGE_IMPLEMENTATION the workflow of the tests slightly differs:
 *   - for 'MEMORY': the 'storage' folder should be removed after the test actor finishes;
 *   - for 'LOCAL': the 'apify_storage' folder should be removed after the test actor finishes;
 *   - for 'PLATFORM': SDK packages should be copied to respective test actor folders
 *      (and also should be removed after pushing the actor to platform and starting the test run there)
 *      to check the latest changes on the platform;
 * @default 'MEMORY'
 * @ignore
 */
process.env.STORAGE_IMPLEMENTATION ??= 'MEMORY';

// If any of the tests failed - we want to exit with a non-zero code
// so that the CI knows that e2e test suite has failed
let failure = false;

async function run() {
    if (!['LOCAL', 'MEMORY', 'PLATFORM'].includes(process.env.STORAGE_IMPLEMENTATION)) {
        throw new Error(`Unknown storage provided: '${process.env.STORAGE_IMPLEMENTATION}'`);
    }

    console.log(`Running E2E tests with storage implementation '${process.env.STORAGE_IMPLEMENTATION}'`);

    const paths = await readdir(basePath, { withFileTypes: true });
    const dirs = paths.filter((dirent) => dirent.isDirectory());

    for (const dir of dirs) {
        if (process.argv.length === 3 && dir.name !== process.argv[2]) {
            continue;
        }

        const now = Date.now();
        const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: dir.name,
            stdout: true,
            stderr: true,
        });
        let seenFirst = false;
        /** @type Map<string, string[]> */
        const allLogs = new Map();
        worker.stderr.on('data', (data) => {
            const str = data.toString();
            const taskLogs = allLogs.get(dir.name) ?? [];
            allLogs.set(dir.name, taskLogs);
            taskLogs.push(str);
        });
        worker.stdout.on('data', (data) => {
            const str = data.toString();
            const taskLogs = allLogs.get(dir.name) ?? [];
            allLogs.set(dir.name, taskLogs);
            taskLogs.push(str);

            if (str.startsWith('[test skipped]')) {
                return;
            }

            if (str.startsWith('[init]')) {
                seenFirst = true;
                return;
            }

            if (!seenFirst) {
                console.log(
                    `${colors.red('[fatal]')} test ${colors.yellow(
                        `[${dir.name}]`,
                    )} did not call "initialize(import.meta.url)"!`,
                );
                worker.terminate();
                return;
            }

            if (
                process.env.STORAGE_IMPLEMENTATION === 'PLATFORM' &&
                (str.startsWith('[build]') || str.startsWith('[run]') || str.startsWith('[kv]'))
            ) {
                const platformStatsMessage = str.match(/\[(?:run|build|kv)] (.*)/);
                if (platformStatsMessage) {
                    console.log(`${colors.yellow(`[${dir.name}] `)}${colors.grey(platformStatsMessage[1])}`);
                }
            }

            const match = str.match(/\[assertion] (passed|failed): (.*)/);

            if (match) {
                const c = match[1] === 'passed' ? colors.green : colors.red;
                console.log(`${colors.yellow(`[${dir.name}] `)}${match[2]}: ${c(match[1])}`);
            }
        });

        worker.on('error', (err) => {
            // If the worker emits any error, we want to exit with a non-zero code
            failure = true;
            console.log(`${colors.red('[fatal]')} test ${colors.yellow(`[${dir.name}]`)} failed with error: ${err}`);
        });

        worker.on('exit', async (code) => {
            if (code === SKIPPED_TEST_CLOSE_CODE) {
                console.log(`Test ${colors.yellow(`[${dir.name}]`)} was skipped`);
                return;
            }

            const took = (Date.now() - now) / 1000;
            const status = code === 0 ? 'success' : 'failure';
            const color = code === 0 ? 'green' : 'red';
            console.log(
                `${colors.yellow(`[${dir.name}] `)}${colors[color](
                    `Test finished with status: ${status} `,
                )}${colors.grey(`[took ${took}s]`)}`,
            );

            if (['MEMORY', 'LOCAL'].includes(process.env.STORAGE_IMPLEMENTATION)) {
                await clearStorage(`${basePath}/${dir.name}`);
            }

            if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
                await clearPackages(`${basePath}/${dir.name}`);
            }

            const taskLogs = allLogs.get(dir.name);

            if (code !== 0 && taskLogs?.length > 0) {
                console.log(taskLogs.join('\n'));
            }

            if (status === 'failure') failure = true;
        });

        await once(worker, 'exit');
    }
}

if (isMainThread) {
    try {
        if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
            console.log('Temporary installing @apify/storage-local');
            execSync(`yarn add -D @apify/storage-local@^2.1.3-beta.1 > /dev/null`, { stdio: 'inherit' });
        }
        if (process.env.STORAGE_IMPLEMENTATION !== 'PLATFORM') {
            console.log('Fetching camoufox');
            execSync(`npx camoufox-js fetch > /dev/null`, { stdio: 'inherit' });
        }
        await run();
    } catch (e) {
        console.error(e);
    } finally {
        if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
            console.log('Removing temporary installation of @apify/storage-local');
            execSync(`yarn remove @apify/storage-local > /dev/null`, { stdio: 'inherit' });
        }
    }

    // We want to exit with non-zero code if any of the tests failed
    if (failure) process.exit(1);
} else {
    await import(`${basePath}/${workerData}/test.mjs`);
}

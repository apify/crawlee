import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { isMainThread, Worker, workerData } from 'node:worker_threads';
import { execSync } from 'node:child_process';
import { colors, getApifyToken, clearPackages, clearStorage, SKIPPED_TEST_CLOSE_CODE } from './tools.mjs';

const basePath = dirname(fileURLToPath(import.meta.url));

process.env.APIFY_LOG_LEVEL = '0'; // switch off logs for better test results visibility
process.env.APIFY_HEADLESS = '1'; // run browser in headless mode (default on platform)
process.env.APIFY_TOKEN ??= await getApifyToken();
process.env.APIFY_CONTAINER_URL ??= 'http://127.0.0.1';
process.env.APIFY_CONTAINER_PORT ??= '8000';

/**
 * Depending on STORAGE_IMPLEMENTATION the workflow of the tests slightly differs:
 *   - for 'MEMORY': the 'crawlee_storage' folder should be removed after the test actor finishes;
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

    execSync(`npm install @apify/storage-local`, { stdio: 'inherit' });

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
        });
        let seenFirst = false;
        worker.stdout.on('data', (data) => {
            const str = data.toString();

            if (str.startsWith('[test skipped]')) {
                return;
            }

            if (str.startsWith('[init]')) {
                seenFirst = true;
                return;
            }

            if (!seenFirst) {
                console.log(`${colors.red('[fatal]')} test ${colors.yellow(`[${dir.name}]`)} did not call "initialize(import.meta.url)"!`);
                worker.terminate();
                return;
            }

            if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM' && (str.startsWith('[build]') || str.startsWith('[run]'))) {
                const platformStatsMessage = str.match(/\[(?:run|build)] (.*)/);
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
        worker.on('exit', async (code) => {
            if (code === SKIPPED_TEST_CLOSE_CODE) {
                console.log(`Test ${colors.yellow(`[${dir.name}]`)} was skipped`);
                return;
            }

            const took = (Date.now() - now) / 1000;
            const status = code === 0 ? 'success' : 'failure';
            const color = code === 0 ? 'green' : 'red';
            console.log(`${colors.yellow(`[${dir.name}] `)}${colors[color](`Test finished with status: ${status} `)}${colors.grey(`[took ${took}s]`)}`);

            if (['MEMORY', 'LOCAL'].includes(process.env.STORAGE_IMPLEMENTATION)) {
                await clearStorage(`${basePath}/${dir.name}`);
            }

            if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
                await clearPackages(`${basePath}/${dir.name}`);
            }

            if (status === 'failure') failure = true;
        });
        await once(worker, 'exit');
    }
}

if (isMainThread) {
    await run();
    // We want to exit with non-zero code if any of the tests failed
    if (failure) process.exit(1);
} else {
    await import(`${basePath}/${workerData}/test.mjs`);
}

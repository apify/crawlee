import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { execSync as execSyncOriginal } from 'node:child_process';
import { got } from 'got';
import fs from 'fs-extra';
import { Actor } from 'apify';
// eslint-disable-next-line import/no-relative-packages
import { URL_NO_COMMAS_REGEX } from '../../packages/utils/dist/index.mjs';

function execSync(command, options) {
    return execSyncOriginal(command, { ...options, encoding: 'utf-8' });
}

/**
 * @param {string} name
 */
const isPrivateEntry = (name) => name === 'SDK_CRAWLER_STATISTICS_0' || name === 'SDK_SESSION_POOL_STATE';

export const SKIPPED_TEST_CLOSE_CODE = 404;

/** @type {Record<string, (text: string) => string>} */
export const colors = {
    red: (text) => `\x1B[31m${text}\x1B[39m`,
    green: (text) => `\x1B[32m${text}\x1B[39m`,
    grey: (text) => `\x1B[90m${text}\x1B[39m`,
    yellow: (text) => `\x1B[33m${text}\x1B[39m`,
};

/**
 * @param {string} dirName
 */
export function getStorage(dirName) {
    let folderName;
    if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') folderName = 'apify_storage';
    if (process.env.STORAGE_IMPLEMENTATION === 'MEMORY') folderName = 'storage';
    return join(dirName, folderName);
}

/**
 * @param {string} dirName
 */
export async function getStats(dirName) {
    const dir = getStorage(dirName);
    const path = join(dir, 'key_value_stores/default/SDK_CRAWLER_STATISTICS_0.json');

    if (!existsSync(path)) {
        return false;
    }

    return fs.readJSON(path);
}

/**
 * @param {string | URL} url
 */
export function getActorTestDir(url) {
    const filename = fileURLToPath(url);
    const actorDirName = dirname(filename);
    return join(actorDirName, 'actor');
}

/**
 * @param {string} dirName
 * @param {number} [memory=4096]
 */
export async function runActor(dirName, memory = 4096) {
    let stats;
    let datasetItems;
    let getKeyValueStoreItems;
    let defaultKeyValueStoreItems;

    const inputPath = join(dirName, '..', 'INPUT');
    const input = fs.existsSync(inputPath) ? fs.readFileSync(inputPath) : undefined;
    const contentType = input ? 'application/json' : undefined;

    if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
        const client = Actor.newClient();

        await copyPackages(dirName);
        try {
            execSync('npx -y apify-cli@beta push --no-prompt', { cwd: dirName });
        } catch (err) {
            console.error(colors.red(`Failed to push actor to the Apify platform. (signal ${colors.yellow(err.signal)})`));

            if (err.stdout) {
                console.log(colors.grey(`  STDOUT: `), err.stdout);
            }

            if (err.stderr) {
                console.log(colors.red(`  STDERR: `), err.stderr);
            }

            throw err;
        }

        const actorName = await getActorName(dirName);
        const { items: actors } = await client.actors().list();
        const { id } = actors.find((actor) => actor.name === actorName);

        const gotClient = got.extend({
            retry: {
                limit: 2,
                statusCodes: [500, 502],
            },
            headers: {
                'user-agent': 'crawlee e2e tests (got)',
            },
            timeout: {
                request: 10000,
            },
        });

        // Do NOT use Apify Client yet!
        // See https://github.com/apify/apify-client-js/issues/277
        let runId;

        try {
            const { data: { id: foundRunId } } = await gotClient(`https://api.apify.com/v2/acts/${id}/runs`, {
                method: 'POST',
                searchParams: {
                    memory,
                },
                headers: {
                    'content-type': contentType,
                    authorization: `Bearer ${client.token}`,
                },
                body: input,
                retry: {
                    limit: 2,
                    statusCodes: [500, 502],
                },
            }).json();

            runId = foundRunId;
        } catch (err) {
            console.error(colors.red(`Failed to start actor run on the Apify platform. (code ${colors.yellow(err.code)})`));

            if (err.response) {
                console.log(colors.grey(`  RESPONSE: `), err.response.body || err.response.rawBody?.toString('utf-8'));
            }

            throw err;
        }

        const {
            defaultKeyValueStoreId,
            defaultDatasetId,
            startedAt: runStartedAt,
            finishedAt: runFinishedAt,
            // id: runId,
            buildId,
            userId,
        } = await client.run(runId).waitForFinish();

        getKeyValueStoreItems = async (name) => {
            const kvResult = await client.keyValueStore(name ? `${userId}/${name}` : defaultKeyValueStoreId).get();

            if (kvResult) {
                const { items: keyValueItems } = await client.keyValueStore(kvResult.id).listKeys();

                if (keyValueItems.length) {
                    console.log(`[kv] View storage: https://console.apify.com/storage/key-value/${kvResult.id}`);
                }

                const entries = await Promise.all(keyValueItems.map(async ({ key }) => {
                    const record = await client.keyValueStore(kvResult.id).getRecord(key, { buffer: true });

                    return {
                        name: record.key,
                        raw: record.value,
                    };
                }));

                return entries.filter(({ name }) => !isPrivateEntry(name));
            }

            return undefined;
        };

        const {
            startedAt: buildStartedAt,
            finishedAt: buildFinishedAt,
        } = await client.build(buildId).get();

        const buildTook = (buildFinishedAt.getTime() - buildStartedAt.getTime()) / 1000;
        console.log(`[build] View build log: https://api.apify.com/v2/logs/${buildId} [build took ${buildTook}s]`);

        const runTook = (runFinishedAt.getTime() - runStartedAt.getTime()) / 1000;
        console.log(`[run] View run: https://console.apify.com/view/runs/${runId} [run took ${runTook}s]`);

        const statsRecord = await client.keyValueStore(defaultKeyValueStoreId).getRecord('SDK_CRAWLER_STATISTICS_0');
        stats = statsRecord?.value;

        const { items } = await client.dataset(defaultDatasetId).listItems();
        datasetItems = items;

        defaultKeyValueStoreItems = await getKeyValueStoreItems();
    } else {
        if (dirName.split('/').at(-2).endsWith('-ts')) {
            try {
                execSync('tsc', { cwd: dirName });
            } catch (/** @type {any} */ e) {
                if ('stdout' in e) {
                    console.error(e.stdout.toString());
                } else {
                    console.log(e);
                }

                // TODO rethrow or not?
            }
        }

        if (input) {
            await Actor.init({
                // @ts-ignore installed only optionally run `run.mjs` script
                storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
            });
            await Actor.setValue('INPUT', input, { contentType });
        }

        await import(join(dirName, 'main.js'));

        await setTimeout(50);
        stats = await getStats(dirName);
        datasetItems = await getDatasetItems(dirName);

        getKeyValueStoreItems = (name = 'default') => getLocalKeyValueStoreItems(dirName, name);
        defaultKeyValueStoreItems = await getKeyValueStoreItems();
    }

    return {
        stats,
        datasetItems,
        defaultKeyValueStoreItems,
        getKeyValueStoreItems,
    };
}

/**
 * @param {string} dirName
 */
async function getActorName(dirName) {
    const actorPackageFile = await fs.readJSON(join(dirName, 'package.json'));
    return actorPackageFile.name;
}

/**
 * In order to test the most recent 'Crawlee' changes we copy locally built packages,
 * push them to the platform together with actor code,
 * and install them there from the disk (not from NPM).
 * These changes are not merged to 'master' yet and thus not yet published to NPM.
 * @param {string} dirName
 * @internal
 */
async function copyPackages(dirName) {
    const srcPackagesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages');
    const destPackagesDir = join(dirName, 'packages');
    await fs.remove(destPackagesDir);

    const { dependencies, overrides } = await fs.readJSON(join(dirName, 'package.json'));

    if (overrides?.apify) {
        Object.assign(dependencies, overrides.apify);
    }

    // We don't need to copy the following packages
    delete dependencies['@apify/storage-local'];
    delete dependencies['apify-client'];
    delete dependencies['deep-equal'];
    delete dependencies['playwright-core'];
    delete dependencies.apify;
    delete dependencies.puppeteer;
    delete dependencies.playwright;

    for (const dependency of Object.values(dependencies)) {
        const packageDirName = dependency.split('/').pop();
        const srcDir = join(srcPackagesDir, packageDirName, 'dist');
        const destDir = join(destPackagesDir, packageDirName, 'dist');
        await fs.copy(srcDir, destDir);
        const srcPackageFile = join(srcPackagesDir, packageDirName, 'package.json');
        const destPackageFile = join(destPackagesDir, packageDirName, 'package.json');
        await fs.copy(srcPackageFile, destPackageFile);
    }
}

/**
 * @param {string} dirName
 */
export async function clearPackages(dirName) {
    const destPackagesDir = join(dirName, 'actor', 'packages');
    await fs.remove(destPackagesDir);
}

/**
 * @param {string} dirName
 */
export async function clearStorage(dirName) {
    let folderName;
    if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') folderName = 'apify_storage';
    if (process.env.STORAGE_IMPLEMENTATION === 'MEMORY') folderName = 'storage';
    const destPackagesDir = join(dirName, 'actor', folderName);
    await fs.remove(destPackagesDir);
}

export async function getApifyToken() {
    const authPath = join(homedir(), '.apify', 'auth.json');

    if (!existsSync(authPath)) {
        throw new Error('You need to be logged in with your Apify account to run E2E tests. Call "apify login" to fix that.');
    }

    const { token } = await fs.readJSON(authPath);
    return token;
}

/**
 * @param {string} dirName
 */
export async function getDatasetItems(dirName) {
    const dir = getStorage(dirName);
    const datasetPath = join(dir, 'datasets/default/');

    if (!existsSync(datasetPath)) {
        return [];
    }

    const dirents = await readdir(datasetPath, { withFileTypes: true });
    const fileNames = dirents.filter((dirent) => dirent.isFile());
    const datasetItems = [];

    for (const fileName of fileNames) {
        if (fileName.name.includes('__metadata__')) continue;

        const filePath = join(datasetPath, fileName.name);
        const datasetItem = await fs.readJSON(filePath);

        if (!isItemHidden(datasetItem)) {
            datasetItems.push(datasetItem);
        }
    }

    return datasetItems;
}

/**
 * Gets all items in the local key-value store
 * @param {string} dirName
 * @param {string} kvName
 */
export async function getLocalKeyValueStoreItems(dirName, kvName) {
    const dir = getStorage(dirName);
    const storePath = join(dir, 'key_value_stores', kvName);

    if (!existsSync(storePath)) {
        return undefined;
    }

    const dirents = await readdir(storePath, { withFileTypes: true });
    const fileNames = dirents.filter((dirent) => dirent.isFile());
    const keyValueStoreRecords = [];

    for (const fileName of fileNames) {
        if (fileName.name.includes('__metadata__')) continue;

        const filePath = join(storePath, fileName.name);
        const buffer = await readFile(filePath);

        const name = fileName.name.split('.').slice(0, -1).join('.');

        if (isPrivateEntry(name)) {
            continue;
        }

        keyValueStoreRecords.push({ name, raw: buffer });
    }

    return keyValueStoreRecords;
}

/**
 * @param {string} dirName
 */
export async function initialize(dirName) {
    process.env.STORAGE_IMPLEMENTATION ??= 'MEMORY';
    if (process.env.STORAGE_IMPLEMENTATION !== 'PLATFORM') {
        process.env.APIFY_LOCAL_STORAGE_DIR = getStorage(dirName);
        process.env.CRAWLEE_STORAGE_DIR = getStorage(dirName);
        process.env.APIFY_HEADLESS = '1'; // run browser in headless mode (default on platform)
        process.env.APIFY_TOKEN ??= await getApifyToken();
        process.env.APIFY_CONTAINER_URL ??= 'http://127.0.0.1';
        process.env.APIFY_CONTAINER_PORT ??= '8000';
    }
    console.log('[init] Storage directory:', process.env.APIFY_LOCAL_STORAGE_DIR || 'n/a (running on the platform)');
}

/**
 * @param {boolean} bool
 * @param {string} message
 */
export async function expect(bool, message) {
    if (bool) {
        console.log(`[assertion] passed: ${message}`);
        await setTimeout(10);
    } else {
        console.log(`[assertion] failed: ${message}`);
        await setTimeout(10);
        process.exit(1);
    }
}

/**
 * @param {string} reason
 */
export async function skipTest(reason) {
    console.error(`[test skipped] ${reason}`);
    process.exit(SKIPPED_TEST_CLOSE_CODE);
}

/**
 * @param {Record<string, any>} item
 * @param {string} propName
 * @returns {boolean}
 */
function checkDatasetItem(item, propName) {
    if (!item.hasOwnProperty(propName)) {
        return false;
    }

    switch (propName) {
        case 'url':
            return item.url.match(URL_NO_COMMAS_REGEX);
        case 'modifiedDate':
            return !Number.isNaN(Date.parse(item.modifiedDate));
        case 'runCount':
            return Number.isInteger(item.runCount);
        default:
            return typeof item[propName] === 'string';
    }
}

/**
 * @param {any[]} items
 * @param {string[]} schema
 */
export function validateDataset(items, schema = []) {
    for (const item of items) {
        for (const propName of schema) {
            if (!checkDatasetItem(item, propName)) {
                return false;
            }
        }
    }

    return true;
}

/**
 * @param {Record<PropertyKey, unknown>} item
 */
function isItemHidden(item) {
    for (const key of Object.keys(item)) {
        if (!key.startsWith('#')) {
            return false;
        }
    }
    return true;
}

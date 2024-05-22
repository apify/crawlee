import { initialize, getActorTestDir, runActor, expect, hasNestedKey } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, defaultKeyValueStoreItems } = await runActor(testActorDirname);

// All requests should fail to test the error snapshots
await expect(stats.requestsFailed === 4, 'All requests failed');

let totalErrorHtmlFiles = 0;
let totalErrorScreenshotFiles = 0;
for (const error of Object.values(stats.errors)) {
    if (hasNestedKey(error, 'firstErrorHtmlUrl')) {
        totalErrorHtmlFiles++;
    }
}

for (const error of Object.values(stats.errors)) {
    if (hasNestedKey(error, 'firstErrorScreenshotUrl')) {
        totalErrorScreenshotFiles++;
    }
}

// Count of error HTML files stored in the stats to make sure they are saved
await expect(totalErrorHtmlFiles === 4, 'Number of HTML error files in stats should be 4');
// Count of error Screenshot files stored in the stats to make sure they are saved
await expect(totalErrorScreenshotFiles === 4, 'Number of screenshots error files in stats should be 4');
// Count of error HTML files and screenshot files stored in the Key-Value store
await expect(
    defaultKeyValueStoreItems.length === 8,
    'Number of HTML and screenshot error snapshots in KV store should be 8',
);

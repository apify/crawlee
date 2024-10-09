import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 0, 'All requests finished');
await expect(datasetItems.length === 1, 'A dataset item was pushed');

const result = datasetItems[0];
expect(
    result.userAgent ===
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'User agent is chrome',
);
expect(result.uuidJsonResponse.uuid !== undefined, 'JSON response contains UUID');
expect(JSON.parse(result.uuidTextResponse).uuid !== undefined, 'Text response contains UUID');

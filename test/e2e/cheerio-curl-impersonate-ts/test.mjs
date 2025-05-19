import { expect,getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 0, 'All requests finished');
await expect(datasetItems.length === 1, 'A dataset item was pushed');

const result = datasetItems[0];

await expect(result.body.length > 1000, 'HTML response is not empty');
await expect(result.title === 'httpbin.org', 'HTML title is correct');
await expect(
    result.userAgent ===
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    'User agent is chrome',
);
await expect(result.uuidJsonResponse.uuid !== undefined, 'JSON response contains UUID');
await expect(JSON.parse(result.uuidTextResponse).uuid !== undefined, 'Text response contains UUID');

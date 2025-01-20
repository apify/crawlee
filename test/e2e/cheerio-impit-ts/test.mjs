import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 0, 'All requests finished');
await expect(datasetItems.length === 1, 'A dataset item was pushed');

const result = datasetItems[0];

expect(result.body.length > 1000, 'HTML response is not empty');
expect(result.title === 'httpbin.org', 'HTML title is correct');
console.log(result.userAgent);
expect(/Gecko\/\d{8} Firefox\/\d{2}/.test(result.userAgent), 'Impit correctly spoofs Firefox');
expect(result.uuidJsonResponse.uuid !== undefined, 'JSON response contains UUID');
expect(JSON.parse(result.uuidTextResponse).uuid !== undefined, 'Text response contains UUID');

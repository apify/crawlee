import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 0, 'All requests finished');
await expect(datasetItems.length === 1, 'A dataset item was pushed');

const result = datasetItems[0];

await expect(result.body.length > 1000, 'HTML response is not empty');
await expect(result.title === 'httpbin.org', 'HTML title is correct');
await expect(/Gecko\/\d{8} Firefox\/\d{2}/.test(result.userAgent), 'Impit correctly spoofs Firefox');
await expect(result.uuidJsonResponse.uuid !== undefined, 'JSON response contains UUID');
await expect(JSON.parse(result.uuidTextResponse).uuid !== undefined, 'Text response contains UUID');

import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished > 0, 'All requests finished');
await expect(datasetItems.length === 1, 'A dataset item was pushed');

const result = datasetItems[0];

expect(result.body.length > 1000, 'HTML response is not empty');
expect(result.title.toLowerCase().includes('crawlee'), 'HTML title is correct');
expect(/Gecko\/\d{8} Firefox\/\d{2}/.test(result.userAgent), 'Impit correctly spoofs Firefox');
expect(result.clientIpJsonResponse.clientIp !== undefined, 'JSON response contains client IP');
expect(JSON.parse(result.clientIpTextResponse).clientIp !== undefined, 'Text response contains client IP');

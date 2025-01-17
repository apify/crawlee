import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished < 20, 'crawler.stop() works');

const visitedUrls = new Set(datasetItems.map((x) => x.url));

await expect(visitedUrls.size < 20, 'crawler.stop() is by default stateless');

import { expect,getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

/// Some extra requests are expected (at most 10 extra for each run).
await expect(stats.requestsFinished < 40, 'crawler.stop() works');

const visitedUrls = new Set(datasetItems.map((x) => x.url));
await expect(visitedUrls.size === datasetItems.length, 'stateful crawler.run({ purgeRQ: false }) works');

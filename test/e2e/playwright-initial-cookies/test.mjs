import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished === 1, 'All requests finished');
await expect(datasetItems[0].numberOfMatchingCookies === 3, 'Number of page cookies');
await expect(
    datasetItems[0].numberOfMatchingCookies === datasetItems[0].initialCookiesLength,
    `Page cookies match the initial defined cookies. Number of non-matching cookies is `
    + `${datasetItems[0].initialCookiesLength - datasetItems[0].numberOfMatchingCookies}`,
);

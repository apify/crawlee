import { expect, getActorTestDir, initialize, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

await expect(stats.requestsFinished === 1, 'All requests finished');
await expect(datasetItems[0].numberOfMatchingCookies === 5, 'Number of page cookies');
await expect(
    datasetItems[0].numberOfMatchingCookies === datasetItems[0].initialCookiesLength,
    `Page cookies match the initial defined cookies. Number of non-matching cookies is `
        + `${datasetItems[0].initialCookiesLength - datasetItems[0].numberOfMatchingCookies}`,
);

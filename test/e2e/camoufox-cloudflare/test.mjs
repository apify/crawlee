import { initialize, getActorTestDir, runActor, expect, skipTest } from '../tools.mjs';

// TODO: re-enable on LOCAL/MEMORY once Camoufox supports the repo's Playwright version.
// Those storage types import the actor in-process against the repo-root node_modules (currently
// Playwright 1.61), but camoufox-js 0.11 ships Firefox 150 and only launches under Playwright 1.60.
// Only the PLATFORM build isolates the actor's pinned 1.60, so the test runs there exclusively.
if (process.env.STORAGE_IMPLEMENTATION !== 'PLATFORM') {
    await skipTest('Camoufox needs Playwright 1.60; only the PLATFORM build can isolate it from the repo-root 1.61');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length === 1, 'Has dataset items');

for (const { isBlocked } of datasetItems) {
    await expect(!isBlocked, 'Is not blocked');
}

import { expect, getActorTestDir, initialize, runActor, skipTest } from '../tools.mjs';

// TODO: re-enable on LOCAL/MEMORY once Camoufox supports the repo's Playwright version.
// Those storage types import the actor in-process against the repo-root node_modules (currently
// Playwright 1.61), but camoufox-js 0.12 declares a playwright-core <1.61 peer range.
// Only the PLATFORM build isolates the actor's pinned playwright version, so the test runs there exclusively.
if (process.env.STORAGE_IMPLEMENTATION !== 'PLATFORM') {
    await skipTest(
        'Camoufox needs its paired Playwright version; only the PLATFORM build can isolate it from the repo-root one',
    );
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length === 1, 'Has dataset items');

for (const { isBlocked } of datasetItems) {
    await expect(!isBlocked, 'Is not blocked');
}

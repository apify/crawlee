import { initialize, getActorTestDir, runActor, expect, skipTest } from '../tools.mjs';

// The actor spins up an HTTP server on 127.0.0.1; that works inside the
// in-process LOCAL/MEMORY worker but is unreachable from the Apify platform
// container, so the run never finishes. Base-href handling is pure parsing
// logic in @crawlee/utils that doesn't depend on the storage backend, so
// LOCAL+MEMORY coverage is sufficient.
if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    await skipTest('localhost fixture is not reachable from the Apify platform');
}

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);

await expect(datasetItems.length === 4, `Enqueueing respects <base href>`);

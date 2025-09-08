import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length > 15, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['url', 'heading', 'requestHandlerMode']), 'Dataset items validation');

await expect(
    datasetItems.filter((it) => it.requestHandlerMode === 'browser').length >= 1,
    'The crawler should handle at least one request in the browser',
);

await expect(
    datasetItems.filter((it) => it.requestHandlerMode === 'httpOnly').length >= 5,
    'The crawler should handle some requests in http-only mode',
);

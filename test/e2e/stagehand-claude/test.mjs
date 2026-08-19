import { expect, getActorTestDir, initialize, runActor, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished === 1, 'Request finished');
await expect(datasetItems.length === 1, 'One dataset item');
await expect(validateDataset(datasetItems, ['url', 'codeJs', 'codePython']), 'Dataset items validation');
await expect(datasetItems[0].codeJs && datasetItems[0].codeJs.length > 0, 'JS code extracted');
await expect(datasetItems[0].codePython && datasetItems[0].codePython.length > 0, 'Python code extracted');

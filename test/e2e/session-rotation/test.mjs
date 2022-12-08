import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 4096);

await expect(datasetItems.length === 11, 'Retried correct number of times');
await expect(
    datasetItems.map(
        (session) => datasetItems.filter((s) => s.id === session.id),
    ).every((x) => x.length <= 2), 'No session used more than three times');

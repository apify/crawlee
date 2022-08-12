import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, 16384);

await expect(datasetItems.length > 0, 'Has dataset items');

const ips = new Set();

for (const { ip } of datasetItems) {
    await expect(!ips.has(ip), 'Unique proxy ip');

    ips.add(ip);
}

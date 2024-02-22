import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, defaultKeyValueStoreItems } = await runActor(testActorDirname);

await expect(stats.requestsFailed === 4, 'All requests failed');
// Count of error HTML files stored in the Key-Value store
await expect(defaultKeyValueStoreItems.length === 3, 'Number of HTML error snapshots in KV store');

import { expect, getActorTestDir, initialize, runActor, skipTest } from '../tools.mjs';

// TODO(v4): redesign for the v4 RequestQueue. The test stages a stuck queue via the v3
// client-side `requestQueue.inProgress` set, which no longer exists in the rewritten queue.
await skipTest('The v4 RequestQueue has no client-side `inProgress` set to stage a stuck queue with');

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats } = await runActor(testActorDirname);

await expect(stats.requestsFinished === 3, 'All requests finished');
await expect(
    stats.crawlerRuntimeMillis > 30 * 1e3 && stats.crawlerRuntimeMillis < 35 * 1e3,
    'RequestQueue triggers auto-reset after being stuck with requests in progress',
);

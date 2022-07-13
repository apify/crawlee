import { initialize, expect, getActorTestDir, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats } = await runActor(testActorDirname);

await expect(stats.requestsFinished === 2, 'All requests finished');
await expect(
    stats.crawlerRuntimeMillis > 60_000 && stats.crawlerRuntimeMillis < 65_000,
    `Ran one task per minute, took ~1 minute to complete, but no more than that (${stats.crawlerRuntimeMillis}ms)`,
);

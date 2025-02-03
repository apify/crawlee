import { initialize, getActorTestDir, pushActor, startActorOnPlatform, expect } from '../tools.mjs';
import { Actor } from 'apify';
import { log } from 'crawlee';
import { setTimeout } from 'node:timers/promises';

if (process.env.STORAGE_IMPLEMENTATION === 'PLATFORM') {
    const testActorDirname = getActorTestDir(import.meta.url);
    await initialize(testActorDirname);

    const client = Actor.newClient();
    const actorId = await pushActor(client, testActorDirname);
    log.info(`Actor build (ID ${actorId})`);

    const { id: queueId } = await client.requestQueues().getOrCreate();
    const limit = 1000;

    const input = JSON.stringify({ limit, queueId });

    const runIds = await Promise.all([
        startActorOnPlatform(client, actorId, input),
        startActorOnPlatform(client, actorId, input),
        startActorOnPlatform(client, actorId, input),
        startActorOnPlatform(client, actorId, input),
    ]);
    log.info(`Started runs (IDs ${JSON.stringify(runIds)})`);

    const stats = await Promise.all(
        runIds.map(async (runId) => {
            await client.run(runId).waitForFinish();
            await setTimeout(6000);
            return client.run(runId).get();
        }),
    );
    log.info('Runs finished');

    const requestQueue = await client.requestQueue(queueId).get();

    await expect(requestQueue.pendingRequestCount === 0, 'No pending requests');
    await expect(requestQueue.handledRequestCount === 1000, 'All requests are handled');

    const firstActorFinish = Math.min(...stats.map((run) => run.finishedAt.valueOf()));
    const lastActorFinish = Math.max(...stats.map((run) => run.finishedAt.valueOf()));

    await expect(lastActorFinish - firstActorFinish < 60 * 1000, 'Actors finished at similar times');
}

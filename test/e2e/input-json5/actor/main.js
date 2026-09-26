import { Actor, Dataset, log } from 'apify';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const a = await Actor.getInput();

    log.info('val', a);

    await Dataset.pushData(a);
}, mainOptions);

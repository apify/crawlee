import { fork } from 'node:child_process';

import { Configuration, Dataset, PlaywrightCrawler, log } from 'crawlee';

import { router } from './routes.mjs';
import { getOrInitQueue } from './shared.mjs';

// For this example, we will spawn 2 separate processes that will scrape the store in parallel.

if (!process.env.IN_WORKER_THREAD) {
    // This is the main process. We will use this to spawn the worker threads.
    log.info('Setting up worker threads.');

    const currentFile = new URL(import.meta.url).pathname;

    // Store a promise per worker, so we wait for all to finish before exiting the main process
    const promises = [];

    // You can decide how many workers you want to spawn, but keep in mind you can only spawn so many before you overload your machine
    for (let i = 0; i < 2; i++) {
        const proc = fork(currentFile, {
            env: {
                // Share the current process's env across to the newly created process
                ...process.env,
                // ...but also tell the process that it's a worker process
                IN_WORKER_THREAD: 'true',
                // ...as well as which worker it is
                WORKER_INDEX: String(i),
            },
        });

        proc.on('online', () => {
            log.info(`Process ${i} is online.`);

            // Log out what the crawlers are doing
            // Note: we want to use console.log instead of log.info because we already get formatted output from the crawlers
            proc.stdout!.on('data', (data) => {
                // eslint-disable-next-line no-console
                console.log(data.toString());
            });

            proc.stderr!.on('data', (data) => {
                // eslint-disable-next-line no-console
                console.error(data.toString());
            });
        });

        proc.on('message', async (data) => {
            log.debug(`Process ${i} sent data.`, data);
            await Dataset.pushData(data);
        });

        promises.push(new Promise((resolve) => {
            proc.once('exit', (code, signal) => {
                log.info(`Process ${i} exited with code ${code} and signal ${signal}`);
                resolve();
            });
        }));
    }

    await Promise.all(promises);

    log.info('Crawling complete!');
} else {
    // This is the worker process. We will use this to scrape the store.

    // Let's build a logger that will prefix the log messages with the worker index
    const workerLogger = log.child({ prefix: `[Worker ${process.env.WORKER_INDEX}]` });

    // This is better set with CRAWLEE_LOG_LEVEL env var
    // or a configuration option. This is just for show 😈
    workerLogger.setLevel(log.LEVELS.DEBUG);

    // Disable the automatic purge on start
    // This is needed when running locally, as otherwise multiple processes will try to clear the default storage (and that will cause clashes)
    Configuration.getGlobalConfig().set('purgeOnStart', false);

    // Get the request queue
    const requestQueue = await getOrInitQueue(false);

    // Configure crawlee to store the worker-specific data in a separate directory (needs to be done AFTER the queue is initialized when running locally)
    const config = new Configuration({
        storageClientOptions: {
            localDataDirectory: `./storage/worker-${process.env.WORKER_INDEX}`,
        },
    });

    workerLogger.debug('Setting up crawler.');
    const crawler = new PlaywrightCrawler({
        log: workerLogger,
        // Instead of the long requestHandler with
        // if clauses we provide a router instance.
        requestHandler: router,
        // Enable the request locking experiment so that we can actually use the queue.
        // highlight-start
        experiments: {
            requestLocking: true,
        },
        // Provide the request queue we've pre-filled in previous steps
        requestQueue,
        // highlight-end
        // Let's also limit the crawler's concurrency, we don't want to overload a single process 🐌
        maxConcurrency: 5,
    }, config);

    await crawler.run();
}

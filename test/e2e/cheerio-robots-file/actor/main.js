import { CheerioCrawler } from '@crawlee/cheerio';
import { Actor } from 'apify';

await Actor.init({
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
});

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10,
    respectRobotsTxtFile: true,
});

crawler.router.addDefaultHandler(async ({ log, request, enqueueLinks, pushData }) => {
    log.info(`Processing ${request.loadedUrl}`);
    await enqueueLinks({
        // '/cart' is disallowed by robots.txt
        globs: ['**/cart', '**/collections/*'],
    });
    await pushData({ url: request.url, loadedUrl: request.loadedUrl });
});

await crawler.run([
    'https://warehouse-theme-metal.myshopify.com',
    'https://warehouse-theme-metal.myshopify.com/checkout', // '/checkout' is disallowed by robots.txt
]);

const data = await crawler.getData();
console.table(data.items);

await Actor.exit({ exit: Actor.isAtHome() });

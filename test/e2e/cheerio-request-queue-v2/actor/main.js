import { Actor, log as Logger } from 'apify';
import { ApifyLogAdapter, CheerioCrawler, Dataset } from '@crawlee/cheerio';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new CheerioCrawler({
        async requestHandler({ $, enqueueLinks, request, log }) {
            const { url } = request;
            await enqueueLinks({
                include: ['https://crawlee.dev/js/docs/**'],
            });

            const pageTitle = $('title').first().text();
            log.info(`REQUEST ID: ${request.id} URL: ${url} TITLE: ${pageTitle}`);

            await Dataset.pushData({ url, pageTitle });
        },
        logger: new ApifyLogAdapter(
            Logger.child({
                prefix: 'CheerioCrawler',
            }),
        ),
    });

    try {
        await crawler.run(['https://crawlee.dev/js/docs/quick-start']);
    } catch (e) {
        console.error(e);
    }
}, mainOptions);

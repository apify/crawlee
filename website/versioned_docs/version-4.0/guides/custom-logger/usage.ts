import { CheerioCrawler, Configuration } from 'crawlee';
import { WinstonAdapter, winstonLogger } from './implementation';

// Wrap your Winston logger in the adapter and pass it to Configuration
const config = new Configuration({
    loggerProvider: new WinstonAdapter(winstonLogger),
});

const crawler = new CheerioCrawler(
    {
        async requestHandler({ request, $, log }) {
            // `log` here is the per-crawler scoped CrawleeLogger instance
            // backed by your Winston adapter.
            log.info(`Processing ${request.url}`);

            const title = $('title').text();
            log.debug('Page title extracted', { title });

            console.log(`Title: ${title}`);
        },
    },
    config,
);

await crawler.run(['https://crawlee.dev']);

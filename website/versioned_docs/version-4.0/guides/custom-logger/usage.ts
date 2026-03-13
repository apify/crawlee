import { CheerioCrawler, serviceLocator } from 'crawlee';
import { WinstonAdapter, winstonLogger } from './implementation';

// Register the Winston adapter as Crawlee's global logger
// This must be done before creating any crawlers
serviceLocator.setLogger(new WinstonAdapter(winstonLogger));

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
);

await crawler.run(['https://crawlee.dev']);

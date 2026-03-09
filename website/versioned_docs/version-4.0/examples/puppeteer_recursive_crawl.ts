import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    async requestHandler({ request, page, enqueueLinks, log }) {
        const title = await page.title();
        log.info(`Title of ${request.url}: ${title}`);

        await enqueueLinks({
            globs: ['http?(s)://www.iana.org/**'],
        });
    },
    maxRequestsPerCrawl: 10,
});

await crawler.addRequests(['https://www.iana.org/']);

await crawler.run();

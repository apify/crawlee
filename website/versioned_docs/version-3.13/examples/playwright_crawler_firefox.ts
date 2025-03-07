import { PlaywrightCrawler } from 'crawlee';
import { firefox } from 'playwright';

// Create an instance of the PlaywrightCrawler class.
const crawler = new PlaywrightCrawler({
    launchContext: {
        // Set the Firefox browser to be used by the crawler.
        // If launcher option is not specified here,
        // default Chromium browser will be used.
        launcher: firefox,
    },
    async requestHandler({ request, page, log }) {
        const pageTitle = await page.title();

        log.info(`URL: ${request.loadedUrl} | Page title: ${pageTitle}`);
    },
});

await crawler.addRequests(['https://example.com']);

// Run the crawler and wait for it to finish.
await crawler.run();

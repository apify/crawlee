// For more information, see https://crawlee.dev/
import { PuppeteerCrawler, log } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new PuppeteerCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    requestHandler: router,
});

await crawler.run(startUrls);

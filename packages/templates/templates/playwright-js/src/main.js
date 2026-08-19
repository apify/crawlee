// For more information, see https://crawlee.dev/
import { Browser, ImpitHttpClient } from '@crawlee/impit-client';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { router } from './routes.js';

const startUrls = ['https://crawlee.dev'];

const crawler = new PlaywrightCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
    requestHandler: router,
    // Comment this option to scrape the full website.
    maxRequestsPerCrawl: 20,
});

await crawler.run(startUrls);

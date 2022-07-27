// For more information, see https://crawlee.dev/
import { KeyValueStore, PuppeteerCrawler, ProxyConfiguration, log } from 'crawlee';
import { router } from './routes.js';

const { startUrls = ['https://crawlee.dev'], debug } = await KeyValueStore.getInput() ?? {};

if (debug) {
    log.setLevel(log.LEVELS.DEBUG);
}

const crawler = new PuppeteerCrawler({
    // proxyConfiguration: new ProxyConfiguration({ proxyUrls: ['...'] }),
    // Be nice to the websites. Remove to unleash full power.
    maxConcurrency: 50,
    requestHandler: router,
});

await crawler.run(startUrls);

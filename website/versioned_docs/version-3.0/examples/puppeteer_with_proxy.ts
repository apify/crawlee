import { PuppeteerCrawler, ProxyConfiguration } from 'crawlee';

// Proxy connection is automatically established in the Crawler
const proxyConfiguration = new ProxyConfiguration();

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    async requestHandler({ page, log }) {
        const status = await page.$eval('td.status', (el) => el.textContent);
        log.info(`Proxy Status: ${status}`);
    },
});

await crawler.addRequests(['http://proxy.crawlee.dev']);

console.log('Running Puppeteer script...');

await crawler.run();

console.log('Puppeteer closed.');

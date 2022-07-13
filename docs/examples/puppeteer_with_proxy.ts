import { PuppeteerCrawler, ProxyConfiguration } from 'crawlee';

// Proxy connection is automatically established in the Crawler
const proxyConfiguration = new ProxyConfiguration();

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    async requestHandler({ page }) {
        const status = await page.$eval('td.status', (el) => el.textContent);
        console.log(`Proxy Status: ${status}`);
    },
});

await crawler.addRequests(['http://proxy.apify.com']);

console.log('Running Puppeteer script...');

await crawler.run();

console.log('Puppeteer closed.');

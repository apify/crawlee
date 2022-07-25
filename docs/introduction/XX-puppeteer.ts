import { PuppeteerCrawler } from 'crawlee';

const crawler = new PuppeteerCrawler({
    async requestHandler({ page, request }) {
        // Extract the <h1> element instead of <title> using Puppeteer.
        const title = await page.$eval('h1', (el) => el.textContent);
        console.log(`The title of "${request.url}" is: ${title}.`);
    },
});

await crawler.run(['https://crawlee.dev']);

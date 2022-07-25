import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ page, request }) {
        // Extract the <h1> element instead of <title> using Playwright.
        const title = await page.$eval('iframe', (el) => el.textContent);
        console.log(`The title of "${request.url}" is: ${title}.`);
    },
});

await crawler.run(['https://crawlee.dev']);

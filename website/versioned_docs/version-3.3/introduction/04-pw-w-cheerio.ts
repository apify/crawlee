// Instead of CheerioCrawler let's use Playwright
// to be able to render JavaScript.
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, parseWithCheerio }) => {
        // Wait for the actor cards to render.
        await page.waitForSelector('.collection-block-item');
        // Extract the page's HTML from browser
        // and parse it with Cheerio.
        const $ = await parseWithCheerio();
        // Use familiar Cheerio syntax to
        // select all the actor cards.
        $('.collection-block-item').each((i, el) => {
            const text = $(el).text();
            console.log(`CATEGORY_${i + 1}: ${text}\n`);
        });
    },
});

await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections']);

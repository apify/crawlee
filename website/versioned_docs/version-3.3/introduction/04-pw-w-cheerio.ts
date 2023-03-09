// Instead of CheerioCrawler let's use Playwright
// to be able to render JavaScript.
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    requestHandler: async ({ page, parseWithCheerio }) => {
        // Wait for the actor cards to render.
        await page.waitForSelector('.ActorStoreItem');
        // Extract the page's HTML from browser
        // and parse it with Cheerio.
        const $ = await parseWithCheerio();
        // Use familiar Cheerio syntax to
        // select all the actor cards.
        $('.ActorStoreItem').each((i, el) => {
            const text = $(el).text();
            console.log(`ACTOR_${i + 1}: ${text}\n`);
        });
    },
});

await crawler.run(['https://apify.com/store']);

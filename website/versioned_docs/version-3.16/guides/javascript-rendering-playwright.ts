import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    async requestHandler({ page }) {
        // page.locator points to an element in the DOM
        // using a CSS selector, but it does not access it yet.
        const actorCard = page.locator('.ActorStoreItem').first();
        // Upon calling one of the locator methods Playwright
        // waits for the element to render and then accesses it.
        const actorText = await actorCard.textContent();
        console.log(`ACTOR: ${actorText}`);
    },
});

await crawler.run(['https://apify.com/store']);

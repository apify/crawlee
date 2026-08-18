"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.PlaywrightCrawler({
    async requestHandler({ page }) {
        // Here we don't wait for the selector and immediately
        // extract the text content from the page.
        const actorText = await page.$eval('.ActorStoreItem', (el) => {
            return el.textContent;
        });
        console.log(`ACTOR: ${actorText}`);
    },
});
await crawler.run(['https://apify.com/store']);

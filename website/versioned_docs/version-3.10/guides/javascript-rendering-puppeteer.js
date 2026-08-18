"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.PuppeteerCrawler({
    async requestHandler({ page }) {
        // Puppeteer does not have the automatic waiting functionality
        // of Playwright, so we have to explicitly wait for the element.
        await page.waitForSelector('.ActorStoreItem');
        // Puppeteer does not have helper methods like locator.textContent,
        // so we have to manually extract the value using in-page JavaScript.
        const actorText = await page.$eval('.ActorStoreItem', (el) => {
            return el.textContent;
        });
        console.log(`ACTOR: ${actorText}`);
    },
});
await crawler.run(['https://apify.com/store']);

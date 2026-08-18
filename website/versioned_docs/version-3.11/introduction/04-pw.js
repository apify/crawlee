"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Instead of CheerioCrawler let's use Playwright
// to be able to render JavaScript.
const crawlee_1 = require("crawlee");
const crawler = new crawlee_1.PlaywrightCrawler({
    requestHandler: async ({ page }) => {
        // Wait for the actor cards to render.
        await page.waitForSelector('.collection-block-item');
        // Execute a function in the browser which targets
        // the actor card elements and allows their manipulation.
        const categoryTexts = await page.$$eval('.collection-block-item', (els) => {
            // Extract text content from the actor cards
            return els.map((el) => el.textContent);
        });
        categoryTexts.forEach((text, i) => {
            console.log(`CATEGORY_${i + 1}: ${text}\n`);
        });
    },
});
await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections']);

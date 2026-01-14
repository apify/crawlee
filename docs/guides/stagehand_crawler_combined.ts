import { StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const crawler = new StagehandCrawler({
    stagehandOptions: {
        model: 'openai/gpt-4o',
    },
    async requestHandler({ page, request, log, pushData }) {
        // Use standard Playwright navigation
        await page.goto(request.url);

        // Use AI to interact with the page
        await page.act('Accept the cookie consent banner');

        // Use standard Playwright for precise operations
        await page.waitForSelector('.product-list');

        // Use AI for complex extraction
        const products = await page.extract(
            'Get all product names and prices',
            z.array(
                z.object({
                    name: z.string(),
                    price: z.number(),
                }),
            ),
        );

        log.info(`Extracted ${products.length} products`);

        // Use standard Playwright for screenshots
        await page.screenshot({ path: 'products.png' });

        await pushData({ url: request.url, products });
    },
});

await crawler.run(['https://example.com/products']);

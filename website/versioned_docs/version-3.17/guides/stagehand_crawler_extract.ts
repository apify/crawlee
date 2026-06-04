import { StagehandCrawler, Dataset } from '@crawlee/stagehand';
import { z } from 'zod';

// Define a schema for the data you want to extract
const ProductSchema = z.object({
    name: z.string(),
    price: z.number(),
    description: z.string(),
    inStock: z.boolean(),
});

const ProductListSchema = z.object({
    products: z.array(ProductSchema),
    totalCount: z.number(),
});

const crawler = new StagehandCrawler({
    stagehandOptions: {
        env: 'LOCAL',
        model: 'anthropic/claude-sonnet-4-20250514',
        verbose: 1,
    },
    maxRequestsPerCrawl: 10,
    async requestHandler({ page, request, log, enqueueLinks }) {
        log.info(`Scraping ${request.url}`);

        // Extract structured product data using AI
        const data = await page.extract(
            'Extract all products from this page including their names, prices, descriptions, and availability',
            ProductListSchema,
        );

        log.info(`Found ${data.products.length} products`);

        // Save each product to the dataset
        for (const product of data.products) {
            await Dataset.pushData({
                ...product,
                url: request.url,
                scrapedAt: new Date().toISOString(),
            });
        }

        // Use AI to find and click "Next page" if it exists
        try {
            await page.act('Click the next page button if available');
            // Enqueue the new URL after navigation
            await enqueueLinks({
                strategy: 'same-domain',
            });
        } catch {
            log.info('No more pages to scrape');
        }
    },
});

await crawler.run(['https://example-shop.com/products']);

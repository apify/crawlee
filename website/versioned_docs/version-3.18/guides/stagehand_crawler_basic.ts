import { StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const crawler = new StagehandCrawler({
    stagehandOptions: {
        env: 'LOCAL',
        model: 'openai/gpt-4.1-mini',
        verbose: 1,
    },
    async requestHandler({ page, request, log, pushData }) {
        log.info(`Processing ${request.url}`);

        // Use AI to extract the page title
        const title = await page.extract('Get the main heading of the page', z.string());

        // Use AI to click on a navigation element
        await page.act('Click on the Documentation link');

        // Extract structured data after navigation
        const navItems = await page.extract('Get all sidebar navigation items', z.array(z.string()));

        log.info(`Found ${navItems.length} navigation items`);

        await pushData({
            url: request.url,
            title,
            navItems,
        });
    },
});

await crawler.run(['https://crawlee.dev']);

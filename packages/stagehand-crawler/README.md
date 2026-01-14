# `@crawlee/stagehand`

Provides AI-powered web crawling using [Stagehand](https://github.com/browserbase/stagehand) for natural language browser automation. The enhanced page object offers `page.act()` to perform actions with plain English, `page.extract()` to get structured data with Zod schemas, and `page.observe()` to discover available actions.

Since `StagehandCrawler` uses AI models for page interaction, it is useful for crawling websites with complex or frequently changing layouts where traditional CSS selectors are difficult to maintain. If the target website has a stable structure, consider using [PlaywrightCrawler](https://crawlee.dev/docs/guides/playwright-crawler-guide), which is faster and doesn't require AI API keys.

The crawler extends [BrowserCrawler](https://crawlee.dev/docs/guides/browser-crawler-guide) and supports all standard Crawlee features including request queues, proxy rotation, autoscaling, and browser fingerprinting.

Note: Stagehand requires an AI model API key (OpenAI, Anthropic, or Google) set via environment variables.

## Example usage

```typescript
import { StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const crawler = new StagehandCrawler({
    stagehandOptions: {
        model: 'openai/gpt-4o',
    },
    async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);

        // Use natural language to interact with the page
        await page.act('Click the "Load More" button');

        // Extract structured data with AI
        const data = await page.extract(
            'Get all product names and prices',
            z.object({
                products: z.array(z.object({
                    name: z.string(),
                    price: z.number(),
                })),
            }),
        );

        log.info(`Found ${data.products.length} products`);
    },
});

await crawler.run(['https://example.com']);
```

For detailed configuration and advanced usage, see the [StagehandCrawler guide](https://crawlee.dev/docs/guides/stagehand-crawler-guide).

# `@crawlee/stagehand`

Provides AI-powered web crawling using [Stagehand](https://github.com/browserbase/stagehand) for natural language browser automation. The enhanced page object offers `page.act()` to perform actions with plain English, `page.extract()` to get structured data with Zod schemas, and `page.observe()` to discover available actions.

Since `StagehandCrawler` uses AI models for page interaction, it is useful for crawling websites with complex or frequently changing layouts where traditional CSS selectors are difficult to maintain. If the target website has a stable structure, consider using [PlaywrightCrawler](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler), which is faster and doesn't require AI API keys.

The crawler extends [BrowserCrawler](https://crawlee.dev/js/api/browser-crawler/class/BrowserCrawler) and supports all standard Crawlee features including request queues, proxy rotation, autoscaling, and browser fingerprinting.

## LLM API Key Configuration

Stagehand requires an API key for the LLM provider (OpenAI, Anthropic, or Google). The recommended way is to use the `modelApiKey` option:

```typescript
const crawler = new StagehandCrawler({
    stagehandOptions: {
        model: 'openai/gpt-4o',
        modelApiKey: 'sk-...', // Your OpenAI API key
    },
    // ...
});
```

You can also override the API key using environment variables:
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- Google: `GOOGLE_API_KEY`

When set, environment variables take precedence over `modelApiKey`.

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

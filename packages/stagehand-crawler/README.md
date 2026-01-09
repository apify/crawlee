# @crawlee/stagehand

AI-powered web crawling with [Stagehand](https://github.com/browserbase/stagehand) integration for [Crawlee](https://crawlee.dev).

`StagehandCrawler` provides natural language browser automation capabilities, making it easy to interact with websites using plain English instructions and extract structured data with AI.

## Features

- 🤖 **Natural Language Actions**: Use `page.act()` to perform actions with plain English
- 📊 **Structured Data Extraction**: Use `page.extract()` with Zod schemas for type-safe extraction
- 👀 **Action Discovery**: Use `page.observe()` to get AI-suggested actions
- 🎯 **Autonomous Agents**: Use `page.agent()` for complex multi-step workflows
- 🛡️ **Anti-Blocking**: Automatic browser fingerprinting and Cloudflare bypass
- ☁️ **Browserbase Support**: Optional cloud browser infrastructure
- 🔄 **Full Crawlee Integration**: All standard Crawlee features (request queue, proxy rotation, autoscaling, etc.)

## Installation

```bash
npm install @crawlee/stagehand @browserbasehq/stagehand zod playwright
```

## Quick Start

```typescript
import { StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const crawler = new StagehandCrawler({
  stagehandOptions: {
    env: 'LOCAL',
    model: 'openai/gpt-4o',
    verbose: 1,
  },
  maxConcurrency: 3,
  async requestHandler({ page, request, log }) {
    log.info(`Processing ${request.url}`);

    // Use natural language to interact with the page
    await page.act('Click the Products menu');
    await page.act('Scroll down to load more items');

    // Extract structured data with AI
    const products = await page.extract(
      'Get all product names, prices, and availability',
      z.object({
        items: z.array(z.object({
          name: z.string(),
          price: z.number(),
          inStock: z.boolean(),
        })),
      })
    );

    log.info(`Found ${products.items.length} products`);

    // Also use standard Playwright methods
    await page.screenshot({ path: 'products.png' });
  },
});

await crawler.run(['https://example.com']);
```

## Configuration

### Stagehand Options

```typescript
const crawler = new StagehandCrawler({
  stagehandOptions: {
    // Environment: 'LOCAL' (default) or 'BROWSERBASE'
    env: 'LOCAL',

    // AI model to use (default: 'openai/gpt-4o')
    model: 'openai/gpt-4o',
    // or: model: 'anthropic/claude-3-5-sonnet-20241022',

    // Browserbase credentials (required when env is 'BROWSERBASE')
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,

    // Logging verbosity: 0 (minimal), 1 (standard), 2 (debug)
    verbose: 1,

    // Enable automatic error recovery
    selfHeal: true,

    // DOM stabilization timeout (ms)
    domSettleTimeout: 30000,
  },

  // All standard Crawlee options work
  maxConcurrency: 5,
  maxRequestsPerCrawl: 100,
  requestHandlerTimeoutSecs: 60,

  // Fingerprinting enabled by default for anti-blocking
  browserPoolOptions: {
    useFingerprints: true,
  },
});
```

### Environment Variables

You can also configure Stagehand via environment variables:

```bash
# Stagehand configuration
STAGEHAND_ENV=LOCAL
STAGEHAND_MODEL=openai/gpt-4o
STAGEHAND_VERBOSE=1

# Browserbase credentials
STAGEHAND_API_KEY=your_browserbase_key
STAGEHAND_PROJECT_ID=your_project_id

# OpenAI API key (required for AI operations)
OPENAI_API_KEY=your_openai_key
```

## API Reference

### page.act(instruction, options?)

Perform an action on the page using natural language.

```typescript
await page.act('Click the login button');
await page.act('Fill in email with test@example.com');
await page.act('Select "United States" from country dropdown');
await page.act('Upload the file at /path/to/file.pdf');
```

### page.extract(instruction, schema)

Extract structured data from the page using AI and a Zod schema.

```typescript
import { z } from 'zod';

const data = await page.extract(
  'Extract product information',
  z.object({
    title: z.string(),
    price: z.number(),
    description: z.string(),
    rating: z.number().optional(),
    reviews: z.array(z.object({
      author: z.string(),
      text: z.string(),
      stars: z.number(),
    })).optional(),
  })
);

console.log(data.title, data.price);
```

### page.observe()

Get AI-suggested actions available on the page.

```typescript
const suggestions = await page.observe();
console.log('Available actions:', suggestions);
```

### page.agent(config?)

Create an autonomous agent for complex multi-step workflows.

```typescript
const agent = page.agent({
  task: 'Find the cheapest laptop under $1000 and add it to cart',
});

await agent.execute();
```

## Advanced Usage

### Using with Router

```typescript
import { StagehandCrawler, createStagehandRouter } from '@crawlee/stagehand';
import { z } from 'zod';

const router = createStagehandRouter();

router.addHandler('product', async ({ page, request, log }) => {
  log.info(`Processing product: ${request.url}`);

  const product = await page.extract(
    'Get product details',
    z.object({
      name: z.string(),
      price: z.number(),
      description: z.string(),
    })
  );

  await Dataset.pushData(product);
});

router.addDefaultHandler(async ({ page, enqueueLinks }) => {
  await enqueueLinks({
    globs: ['https://example.com/products/*'],
    label: 'product',
  });
});

const crawler = new StagehandCrawler({
  requestHandler: router,
});
```

### Combining with Standard Playwright Methods

```typescript
async requestHandler({ page, log }) {
  // Standard Playwright methods work normally
  await page.goto('https://example.com');
  await page.waitForSelector('.content');

  // Mix with AI-powered methods
  await page.act('Click the "Load More" button');

  // Back to standard Playwright
  const html = await page.content();
  await page.screenshot({ path: 'screenshot.png' });

  // AI extraction
  const data = await page.extract('Get all article titles', schema);
}
```

### Using Browserbase Cloud Browsers

```typescript
const crawler = new StagehandCrawler({
  stagehandOptions: {
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: 'openai/gpt-4o',
  },
  maxConcurrency: 10, // Scale with cloud browsers
});
```

## Migration from PlaywrightCrawler

`StagehandCrawler` is designed to be a drop-in replacement for `PlaywrightCrawler` with additional AI capabilities:

```typescript
// Before
import { PlaywrightCrawler } from '@crawlee/playwright';

const crawler = new PlaywrightCrawler({
  async requestHandler({ page }) {
    await page.click('.button');
  },
});

// After - add AI capabilities
import { StagehandCrawler } from '@crawlee/stagehand';

const crawler = new StagehandCrawler({
  stagehandOptions: {
    model: 'openai/gpt-4o',
  },
  async requestHandler({ page }) {
    // Old code still works
    await page.click('.button');

    // New AI methods available
    await page.act('Click the submit button');
  },
});
```

## Anti-Blocking Features

`StagehandCrawler` automatically applies browser fingerprinting and anti-bot measures:

- Browser fingerprinting (enabled by default)
- User-Agent randomization
- Viewport randomization
- WebDriver property hiding
- Cloudflare challenge handling
- Automatic proxy rotation on blocking

To disable fingerprinting:

```typescript
const crawler = new StagehandCrawler({
  browserPoolOptions: {
    useFingerprints: false,
  },
});
```

## Examples

### E-commerce Product Scraping

```typescript
import { StagehandCrawler } from '@crawlee/stagehand';
import { Dataset } from '@crawlee/core';
import { z } from 'zod';

const crawler = new StagehandCrawler({
  stagehandOptions: {
    model: 'openai/gpt-4o',
  },
  async requestHandler({ page, request, enqueueLinks }) {
    if (request.label === 'category') {
      await enqueueLinks({
        globs: ['https://example.com/products/*'],
        label: 'product',
      });
    }

    if (request.label === 'product') {
      const product = await page.extract(
        'Get product details',
        z.object({
          name: z.string(),
          price: z.number(),
          description: z.string(),
          images: z.array(z.string()),
          inStock: z.boolean(),
        })
      );

      await Dataset.pushData(product);
    }
  },
});

await crawler.run([
  { url: 'https://example.com/category', label: 'category' },
]);
```

### Form Automation

```typescript
async requestHandler({ page, log }) {
  await page.act('Click the "Sign Up" button');
  await page.act('Fill in email with test@example.com');
  await page.act('Fill in password with securePassword123');
  await page.act('Select "United States" from country dropdown');
  await page.act('Check the "I agree to terms" checkbox');
  await page.act('Click the "Create Account" button');

  log.info('Account created successfully');
}
```

## Troubleshooting

### Missing AI Model API Key

If you get errors about missing API keys, make sure to set the appropriate environment variable:

```bash
export OPENAI_API_KEY=your_key_here
# or
export ANTHROPIC_API_KEY=your_key_here
```

### Stagehand Import Errors

Make sure you have installed the peer dependencies:

```bash
npm install @browserbasehq/stagehand playwright zod
```

### Performance Tips

- Use `verbose: 0` to reduce logging overhead
- Set appropriate `domSettleTimeout` for your pages (faster pages = lower timeout)
- Use `maxConcurrency` to control parallel browser instances
- Consider using Browserbase for better scaling

## Resources

- [Stagehand Documentation](https://docs.stagehand.dev)
- [Crawlee Documentation](https://crawlee.dev)
- [Browserbase](https://www.browserbase.com)
- [GitHub Repository](https://github.com/apify/crawlee)

## License

Apache-2.0

---

For more information, visit [crawlee.dev](https://crawlee.dev)

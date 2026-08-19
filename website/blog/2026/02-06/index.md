---
slug: crawlee-v3-16
title: "Crawlee v3.16: AI-Powered Crawling with StagehandCrawler"
description: "Crawlee v3.16 introduces StagehandCrawler for AI-powered browser automation, async iterators for Dataset and KeyValueStore, sitemap discovery, and improved Cloudflare handling."
authors: [B4nan]
---

Crawlee v3.16 is here, and the headline feature is the new `StagehandCrawler` — an AI-powered crawler that lets you interact with web pages using natural language instead of CSS selectors. On top of that, we've added async iterators for `Dataset` and `KeyValueStore`, a new `discoverValidSitemaps` utility, and made `handleCloudflareChallenge` more configurable.

Here's what's new:

- [StagehandCrawler — AI-powered browser automation](/blog/crawlee-v3-16#stagehandcrawler--ai-powered-browser-automation)
- [Async iterators for Dataset and KeyValueStore](/blog/crawlee-v3-16#async-iterators-for-dataset-and-keyvaluestore)
- [discoverValidSitemaps utility](/blog/crawlee-v3-16#discovervalidsitemaps-utility)
- [Improved Cloudflare challenge handling](/blog/crawlee-v3-16#improved-cloudflare-challenge-handling)

<!-- truncate -->

## StagehandCrawler — AI-powered browser automation

The new [`@crawlee/stagehand`](https://crawlee.dev/js/api/stagehand-crawler) package integrates [Browserbase's Stagehand](https://github.com/browserbase/stagehand) with Crawlee's crawling infrastructure. Instead of writing brittle CSS selectors or XPath expressions, you describe what you want in plain English and let the AI figure out the rest.

The enhanced page object provides four AI methods:

- **`page.act(instruction)`** — perform actions described in natural language (e.g., "Click the 'Load More' button")
- **`page.extract(instruction, schema)`** — extract structured data from the page using Zod schemas for type safety
- **`page.observe()`** — discover available actions on the current page
- **`page.agent(config)`** — create an autonomous agent for complex multi-step workflows

Since [`StagehandCrawler`](https://crawlee.dev/js/api/stagehand-crawler/class/StagehandCrawler) extends [`BrowserCrawler`](https://crawlee.dev/js/api/browser-crawler/class/BrowserCrawler), you get all the standard Crawlee features out of the box — [request queues](https://crawlee.dev/js/docs/guides/request-storage), [proxy rotation](https://crawlee.dev/js/docs/guides/proxy-management), [autoscaling](https://crawlee.dev/js/api/core/class/AutoscaledPool), [session management](https://crawlee.dev/js/docs/guides/session-management), and [browser fingerprinting](https://crawlee.dev/js/docs/guides/avoid-blocking). It's not a separate tool you have to wire up manually; it's a full Crawlee crawler with AI superpowers.

Here's a basic example showing how to interact with a page and extract structured data:

```typescript
import { StagehandCrawler } from '@crawlee/stagehand';
import { z } from 'zod';

const crawler = new StagehandCrawler({
    stagehandOptions: {
        model: 'openai/gpt-4.1-mini',
        apiKey: 'your-api-key', // Your OpenAI API key (or use OPENAI_API_KEY env var)
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

The `StagehandCrawler` is especially useful for websites with complex or frequently changing layouts where traditional selectors are hard to maintain. If the target website has a stable structure, [`PlaywrightCrawler`](https://crawlee.dev/js/api/playwright-crawler/class/PlaywrightCrawler) remains the better choice — it's faster and doesn't require AI API keys.

**Installation:**

```bash
npm install @crawlee/stagehand @browserbasehq/stagehand
```

For a deeper dive into the architecture, all four AI methods, configuration options, and more examples, check out the [StagehandCrawler guide](https://crawlee.dev/js/docs/guides/stagehand-crawler-guide).

## Async iterators for Dataset and KeyValueStore

Previously, iterating over all items in a [`Dataset`](https://crawlee.dev/js/api/core/class/Dataset) or all keys in a [`KeyValueStore`](https://crawlee.dev/js/api/core/class/KeyValueStore) required manual pagination with `getData()` or `forEachKey()`. This release adds `for await...of` support, making iteration straightforward and memory-efficient.

Both `Dataset` and `KeyValueStore` now support direct iteration as well as `values()`, `entries()`, and `keys()` methods:

```typescript
import { Dataset, KeyValueStore } from 'crawlee';

// Dataset — iterate over all items
const dataset = await Dataset.open();

for await (const item of dataset) {
    console.log(item);
}

// Or use values()/entries() for more control
for await (const [index, item] of dataset.entries()) {
    console.log(`Item #${index}:`, item);
}

// KeyValueStore — iterate over entries
const kvs = await KeyValueStore.open();

for await (const [key, value] of kvs) {
    console.log(key, value);
}

// Or iterate over just keys or values
for await (const key of kvs.keys()) {
    console.log(key);
}

for await (const value of kvs.values()) {
    console.log(value);
}
```

The iteration handles pagination internally, so you don't have to worry about offsets or cursors. Existing code that uses `await` on `listItems()` or `listKeys()` continues to work unchanged — the methods now return hybrid objects that support both `await` and `for await...of`.

## discoverValidSitemaps utility

The new [`discoverValidSitemaps`](https://crawlee.dev/js/api/utils/function/discoverValidSitemaps) async generator in `@crawlee/utils` takes a list of URLs and automatically discovers sitemap files for those domains. It checks `robots.txt` for sitemap declarations, then tries common paths like `/sitemap.xml`, `/sitemap.txt`, and `/sitemap_index.xml`.

```typescript
import { discoverValidSitemaps } from '@crawlee/utils';

for await (const sitemapUrl of discoverValidSitemaps(['https://example.com'])) {
    console.log('Found sitemap:', sitemapUrl);
}
```

This is handy when you want to seed a crawl from sitemaps without knowing the exact sitemap URL upfront.

## Improved Cloudflare challenge handling

The [`handleCloudflareChallenge`](https://crawlee.dev/js/api/playwright-crawler/namespace/playwrightUtils) helper now accepts configuration callbacks for more control over how Cloudflare challenges are detected and solved. The new options include:

- **`clickPositionCallback`** — override how the checkbox click position is calculated
- **`clickCallback`** — override the actual checkbox clicking logic
- **`isChallengeCallback`** — customize detection of Cloudflare challenge pages
- **`isBlockedCallback`** — customize detection of Cloudflare block pages
- **`preChallengeSleepSecs`** — add a delay before the first click attempt (defaults to 1s)

```typescript
import { PlaywrightCrawler } from 'crawlee';

const crawler = new PlaywrightCrawler({
    postNavigationHooks: [
        async ({ handleCloudflareChallenge }) => {
            await handleCloudflareChallenge({
                // Custom click position for environments where the
                // default detection doesn't work
                clickPositionCallback: async (page) => {
                    const box = await page.locator('iframe').first().boundingBox();
                    return box ? { x: box.x + 25, y: box.y + 25 } : null;
                },
                preChallengeSleepSecs: 2,
            });
        },
    ],
    // ...
});
```

These options are particularly useful when running in environments where the default checkbox detection needs adjustment.

---

That's a wrap for Crawlee v3.16! For the full list of changes, check out the [changelog on GitHub](https://github.com/apify/crawlee/blob/master/CHANGELOG.md). If you have questions or feedback, [open a GitHub discussion](https://github.com/apify/crawlee/discussions) or [join our Discord community](https://apify.com/discord).

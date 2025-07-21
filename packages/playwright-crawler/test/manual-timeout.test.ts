import { PlaywrightCrawler } from 'crawlee';
import { test, expect } from 'vitest';

test('PlaywrightCrawler times out', async () => {
  const crawler = new PlaywrightCrawler({
    requestHandlerTimeoutSecs: 3, // Crawler timeout (3s)
    requestHandler: async () => {
      await new Promise((res) => setTimeout(res, 4000)); // Trigger timeout (4s > 3s)
    },
  });

  const stats = await crawler.run(['https://example.com']);
  expect(stats.requestsFailed).toBe(1);
}, 30_000); // Vitest timeout (30s)

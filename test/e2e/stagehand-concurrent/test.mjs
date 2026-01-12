import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 16384);

await expect(stats.requestsFinished === 3, 'All 3 requests finished');
await expect(stats.requestsFailed === 0, 'No requests failed');
await expect(datasetItems.length === 3, 'Three dataset items');
await expect(validateDataset(datasetItems, ['url', 'title', 'browserId']), 'Dataset items validation');

// Verify we got unique browser IDs (multiple browsers were used)
const browserIds = new Set(datasetItems.map((item) => item.browserId));
console.log(`[Test] Unique browser IDs: ${browserIds.size}`);
await expect(browserIds.size >= 2, 'Multiple browser instances used');

// Verify all URLs were processed
const urls = datasetItems.map((item) => item.url);
await expect(urls.some((u) => u.includes('crawlee.dev')), 'crawlee.dev processed');
await expect(urls.some((u) => u.includes('apify.com')), 'apify.com processed');
await expect(urls.some((u) => u.includes('blog.apify.com')), 'blog.apify.com processed');

// Verify titles were extracted
for (const item of datasetItems) {
    await expect(item.title && item.title.length > 0, `Title extracted for ${item.url}`);
}

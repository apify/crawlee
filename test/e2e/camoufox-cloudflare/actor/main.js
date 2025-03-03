import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';
import { Actor } from 'apify';
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage:
        process.env.STORAGE_IMPLEMENTATION === 'LOCAL'
            ? new (await import('@apify/storage-local')).ApifyStorageLocal()
            : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(),
        postNavigationHooks: [
            async ({ handleCloudflareChallenge }) => {
                await handleCloudflareChallenge();
            },
        ],
        launchContext: {
            launcher: firefox,
            launchOptions: await launchOptions({
                headless: true,
            }),
        },
        async requestHandler({ page, parseWithCheerio }) {
            const isBlocked = await page
                .evaluate(async () => {
                    return !!document.querySelector('.footer > .footer-inner > .diagnostic-wrapper > .ray-id');
                })
                .catch(() => false);
            const $ = await parseWithCheerio();
            const title = $('h1').first().text().trim();
            await Dataset.pushData({ isBlocked, title });
        },
    });

    await crawler.run(['https://grabjobs.co']);
}, mainOptions);

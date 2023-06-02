import { Actor } from 'apify';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';

// fails after update to playwright 1.29.0, looks like issue the chromium extension, maybe the manifest_version 2 vs 3?
process.exit(404);

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new (await import('@apify/storage-local')).ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(),
        launchContext: {
            experimentalContainers: true,
        },
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = 'networkidle';
        }],
        async requestHandler({ page }) {
            const content = await page.content();
            await Dataset.pushData({ ip: content.match(/"clientIp":\s*"(.*)"/)?.[1] });
        },
    });

    await crawler.run(['https://api.apify.com/v2/browser-info?1', 'https://api.apify.com/v2/browser-info?2']);
}, mainOptions);

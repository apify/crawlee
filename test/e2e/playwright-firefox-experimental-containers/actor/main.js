import { Actor } from 'apify';
import playwright from 'playwright';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';
import { ApifyStorageLocal } from '@apify/storage-local';

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        browserPoolOptions: {
            browserPlugins: [
                playwright.firefox,
            ],
        },
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

import { Actor } from 'apify';
import playwright from 'playwright';
import { Dataset, PlaywrightCrawler } from '@crawlee/playwright';
import { ApifyStorageLocal } from '@apify/storage-local';

// timeouts nowadays, hard to say why
process.exit(404);

const mainOptions = {
    exit: Actor.isAtHome(),
    storage: process.env.STORAGE_IMPLEMENTATION === 'LOCAL' ? new ApifyStorageLocal() : undefined,
};

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        proxyConfiguration: await Actor.createProxyConfiguration(),
        launchContext: {
            launcher: playwright.firefox,
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

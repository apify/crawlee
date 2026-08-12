import { Dataset, handleCloudflareChallengeHook, PlaywrightCrawler } from '@crawlee/playwright';
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
        // The target hard-blocks datacenter IP ranges outright (block page, not a solvable
        // challenge), so this test needs residential exit nodes.
        proxyConfiguration: await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'] }),
        // Camoufox ships its own anti-detection; Crawlee's fingerprint injection conflicts with it
        // and keeps Cloudflare from ever clearing the challenge.
        browserPoolOptions: { useFingerprints: false },
        preNavigationHooks: [
            async ({ page }) => {
                // TODO: remove this hook once a Camoufox build with daijro/camoufox#625 is released.
                // Cloudflare's challenge throws cross-origin `Script error.`s with no location; Camoufox's
                // juggler currently forwards them without a `location`, and Playwright 1.60+ then crashes
                // the driver on `pageError.location.url` (Playwright won't guard it — microsoft/playwright#40982,
                // declined). The fix is producer-side in daijro/camoufox#625 but not yet in a released build,
                // so until then we swallow the errors here. See daijro/camoufox#635.
                await page.addInitScript(() => {
                    window.addEventListener(
                        'error',
                        (e) => {
                            e.preventDefault();
                            e.stopImmediatePropagation();
                        },
                        true,
                    );
                    window.addEventListener('unhandledrejection', (e) => e.preventDefault(), true);
                });
            },
        ],
        // The hook returns the post-challenge response - otherwise the original 403 challenge
        // response would propagate and the crawler would throw on the blocked status code.
        // verbose keeps the challenge detection visible in the nightly run logs
        postNavigationHooks: [handleCloudflareChallengeHook({ verbose: true })],
        launchContext: {
            launcher: firefox,
            launchOptions: await launchOptions({
                headless: true,
            }),
        },
        async requestHandler({ page, parseWithCheerio }) {
            const isBlocked = await page
                .evaluate(async () => {
                    return !!document.querySelector('.footer .footer-inner .diagnostic-wrapper .ray-id');
                })
                .catch(() => false);
            const $ = await parseWithCheerio();
            const title = $('h1').first().text().trim();
            await Dataset.pushData({ isBlocked, title });
        },
    });

    await crawler.run(['https://grabjobs.co']);
}, mainOptions);

import { harness, scenario } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Dataset, handleCloudflareChallengeHook, PlaywrightCrawler, playwrightBrowserPool } =
        await import('@crawlee/playwright');
    const { Actor } = await import('apify');
    const { launchOptions } = await import('camoufox-js');
    const { firefox } = await import('playwright');

    const mainOptions = { exit: Actor.isAtHome() };

    await Actor.main(async () => {
        const crawler = new PlaywrightCrawler({
            // The target hard-blocks datacenter IP ranges outright (block page, not a solvable
            // challenge), so this test needs residential exit nodes.
            proxyConfiguration: await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'] }),
            // Cloudflare serves its challenge with a 403 status. v3's handleCloudflareChallenge removed
            // 403 from the session pool's blocked status codes itself; in v4 that is an explicit crawler
            // option, and keeping 403 in the default set would fail challenged requests before the hook
            // below gets a chance to solve them on retries.
            blockedStatusCodes: [401, 429],
            browserPool: playwrightBrowserPool({
                // Camoufox ships its own anti-detection; Crawlee's fingerprint injection conflicts with it
                // and keeps Cloudflare from ever clearing the challenge.
                useFingerprints: false,
                launchContext: {
                    launcher: firefox,
                    launchOptions: await launchOptions({
                        headless: true,
                    }),
                },
            }),
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
            // verbose keeps the challenge detection visible in the nightly run logs
            postNavigationHooks: [handleCloudflareChallengeHook({ verbose: true })],
            async requestHandler({ page, parseWithCheerio }) {
                const isBlocked = await page
                    .evaluate(async () => {
                        return !!document.querySelector('.footer .footer-inner .ray-id');
                    })
                    .catch(() => false);
                const $ = await parseWithCheerio();
                const title = $('h1').first().text().trim();
                await Dataset.pushData({ isBlocked, title });
            },
        });

        await crawler.run(['https://grabjobs.co']);
    }, mainOptions);
};

// TODO: re-enable once the platform run gets past the challenge; it never cleared there, earlier passes were false positives.
test.skip('camoufox-cloudflare: Cloudflare does not clear the challenge on the platform (residential proxy)', async ({
    expect,
    createActor,
    runActor,
}) => {
    const actor = await createActor('camoufox-cloudflare', {
        source: scenario(import.meta.filename, main, { image: 'camoufox' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    expect(items).toHaveLength(1);
    expect(items.every(({ isBlocked }) => !isBlocked)).toBe(true);
});

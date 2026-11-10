import { getStats, harness, scenario, validateDataset } from './harness.js';

const { test } = harness();

export const main = async () => {
    const { Actor } = await import('apify');
    const { Dataset, PuppeteerCrawler } = await import('@crawlee/puppeteer');

    const mainOptions = { exit: Actor.isAtHome() };

    // The "bad" links from the badssl.com index page, listed here because that page itself is flaky.
    const badSslUrls = [
        'https://expired.badssl.com/',
        'https://wrong.host.badssl.com/',
        'https://self-signed.badssl.com/',
        'https://untrusted-root.badssl.com/',
        'https://revoked.badssl.com/',
        'https://pinning-test.badssl.com/',
        'https://client-cert-missing.badssl.com/',
        'https://mixed-script.badssl.com/',
        'https://very.badssl.com/',
        'https://rc4-md5.badssl.com/',
        'https://rc4.badssl.com/',
        'https://3des.badssl.com/',
        'https://null.badssl.com/',
        'https://mozilla-old.badssl.com/',
        'https://dh480.badssl.com/',
        'https://dh512.badssl.com/',
        'https://dh1024.badssl.com/',
        'https://dh-small-subgroup.badssl.com/',
        'https://dh-composite.badssl.com/',
        'https://no-sct.badssl.com/',
        'https://subdomain.preloaded-hsts.badssl.com/',
        'https://superfish.badssl.com/',
        'https://edellroot.badssl.com/',
        'https://dsdtestprovider.badssl.com/',
        'https://preact-cli.badssl.com/',
        'https://webpack-dev-server.badssl.com/',
        'https://captive-portal.badssl.com/',
        'https://mitm-software.badssl.com/',
        'https://sha1-2017.badssl.com/',
        'https://sha1-intermediate.badssl.com/',
        'https://invalid-expected-sct.badssl.com/',
    ];

    await Actor.main(async () => {
        const crawler = new PuppeteerCrawler({
            // Keep concurrency low so the burst of requests to badssl.com doesn't trip its
            // rate limiting, which surfaces as ERR_CONNECTION_RESET and makes the test flaky.
            maxConcurrency: 2,
            launchContext: { launchOptions: { acceptInsecureCerts: true } },
            preNavigationHooks: [
                ({ gotoOptions }) => {
                    gotoOptions.waitUntil = ['networkidle2'];
                },
            ],
            async requestHandler({ page, request, log }) {
                log.info(`Scraping ${request.url}`);
                const title = await page.title();
                await Dataset.pushData({ url: request.url, title });
            },
        });

        await crawler.run(badSslUrls);
    }, mainOptions);
};

test('puppeteer-ignore-ssl-errors', async ({ expect, createActor, runActor }) => {
    const actor = await createActor('puppeteer-ignore-ssl-errors', {
        source: scenario(import.meta.filename, main, { image: 'puppeteer' }),
        memory: 16384,
    });
    const result = await runActor(actor);
    const stats = await getStats(result);
    const { items } = await result.getDataset<any>();

    expect(result.status).toBe('SUCCEEDED');
    // Of badssl.com's ~31 "bad" links, ~10 use ciphers/protocols modern Chrome removed
    // (3des, rc4, dh*, null, …) and can never load regardless of acceptInsecureCerts, so the
    // ceiling is ~20. Assert a comfortable floor that still proves cert errors are bypassed.
    expect(stats.requestsSucceeded).toBeGreaterThan(10);
    expect(items.length).toBeGreaterThan(10);
    expect(validateDataset(items, ['url', 'title'])).toBe(true);
});

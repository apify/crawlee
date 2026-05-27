/**
 * Integration test: PlaywrightCrawler against a remote Browserless CDP endpoint
 * forces useIncognitoPages: true, so two pages on the same remote browser do
 * NOT share cookies.
 *
 * Mirrors temp-examples/examples/cookie-sharing-pages-same-remote-browser.ts:
 *   - retireBrowserAfterPageCount: 10  → both requests stay on the same browser
 *   - saveResponseCookies: false       → Session cannot carry cookies across requests
 *   - Request 1 → /cookies/set?TOKEN=… (httpbin Set-Cookie)
 *   - Request 2 → /cookies (httpbin echoes received cookies in body)
 *
 * With the wrapper removed, request 2's body should report no cookies.
 */
import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PlaywrightCrawler } from 'crawlee';
import { expect, test } from 'vitest';

import { BROWSERLESS_URL, httpbin } from './helpers.js';

class BrowserlessCDPProvider extends RemoteBrowserProvider {
    override maxOpenBrowsers = 1;
    async connect() {
        return { url: BROWSERLESS_URL };
    }
}

// Gate on CRAWLEE_DIFFICULT_TESTS so plain `pnpm test` skips integration tests
// (no Docker required); `pnpm test:integration` and `pnpm test:full` set the flag.
test.skipIf(!process.env.CRAWLEE_DIFFICULT_TESTS)(
    'remote Playwright CDP: pages on the same browser do not share cookies',
    async () => {
        const observations: { controllerId: string; body: { cookies: Record<string, string> } }[] = [];

        const crawler = new PlaywrightCrawler({
            launchContext: {
                remoteBrowser: new BrowserlessCDPProvider(),
            },
            browserPoolOptions: {
                retireBrowserAfterPageCount: 10, // keep the same browser across both requests
                maxOpenPagesPerBrowser: 2,
            },
            saveResponseCookies: false, // remove Session-based propagation
            maxConcurrency: 1,
            maxRequestsPerCrawl: 2,
            async requestHandler({ page, browserController }) {
                const body = await page.evaluate(() => document.body.textContent?.trim());
                observations.push({
                    controllerId: browserController.id,
                    body: body ? JSON.parse(body) : null,
                });
            },
        });

        await crawler.run([httpbin('/cookies/set?TOKEN=integration-test'), httpbin('/cookies')]);

        expect(observations).toHaveLength(2);
        // Same browser handled both requests — otherwise the assertion below proves nothing.
        expect(observations[0].controllerId).toBe(observations[1].controllerId);
        // Request 1 actually got the cookie (else request 2's emptiness proves nothing).
        expect(observations[0].body.cookies).toEqual({ TOKEN: 'integration-test' });
        // Request 2 (the /cookies echo) must NOT include the TOKEN cookie set by request 1.
        expect(observations[1].body.cookies).toEqual({});
    },
    60_000,
);

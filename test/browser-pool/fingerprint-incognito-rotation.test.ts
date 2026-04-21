/**
 * Test to replicate issue #2310: useIncognitoPages doesn't rotate fingerprints
 * https://github.com/apify/crawlee/issues/2310
 *
 * When useIncognitoPages: true, multiple pages are opened in the same browser instance.
 * Fingerprints should be unique per incognito context, but currently they all share
 * the browser-level fingerprint.
 */
import playwright from 'playwright';

import { BrowserPool } from '../../packages/browser-pool/src/browser-pool.js';
import { PlaywrightPlugin } from '../../packages/browser-pool/src/playwright/playwright-plugin.js';

describe('Fingerprint rotation with useIncognitoPages', () => {
    test('should use different fingerprints for different incognito contexts in the same browser', async () => {
        const pool = new BrowserPool({
            browserPlugins: [
                new PlaywrightPlugin(playwright.chromium, {
                    useIncognitoPages: true,
                }),
            ],
            maxOpenPagesPerBrowser: 10, // Allow multiple pages per browser
            useFingerprints: true,
        });

        const pages: any[] = [];
        const userAgents: string[] = [];

        try {
            // Open 3 pages - they should all land in the same browser (maxOpenPagesPerBrowser=10)
            // but each should have its own unique fingerprint
            for (let i = 0; i < 3; i++) {
                const page = await pool.newPage();
                pages.push(page);

                await page.goto(`file://${import.meta.dirname}/test.html`).catch(() => {
                    // Ignore navigation errors for about:blank-like
                });

                const ua = await page.evaluate(() => navigator.userAgent);
                userAgents.push(ua);
            }

            // Verify all pages landed in the same browser instance (confirms they share a browser)
            const controllers = pages.map((p) => pool.getBrowserControllerByPage(p));
            const sameController = controllers.every((c) => c === controllers[0]);
            // Note: may not all be in the same browser if limits kick in, but with maxOpenPagesPerBrowser=10
            // and only 3 pages, they should all be in the same browser

            console.log('User agents collected:', userAgents);
            console.log('All in same browser:', sameController);

            // THE BUG: With the current code, all userAgents will be identical
            // because they all use launchContext.fingerprint from the same browser.
            // After the fix, they should be different.
            const uniqueUserAgents = new Set(userAgents);
            console.log(`Unique user agents: ${uniqueUserAgents.size} out of ${userAgents.length}`);

            // This assertion FAILS on the buggy code (all UAs are the same)
            // and PASSES after the fix (each incognito page gets a unique fingerprint)
            expect(uniqueUserAgents.size).toBe(userAgents.length); // Each page should have a unique UA
        } finally {
            for (const page of pages) {
                await page.close().catch(() => {});
            }
            await pool.destroy();
        }
    }, 60_000);

    test('should use the SAME fingerprint for different pages in the same non-incognito browser (existing behavior)', async () => {
        const pool = new BrowserPool({
            browserPlugins: [
                new PlaywrightPlugin(playwright.chromium, {
                    useIncognitoPages: false,
                }),
            ],
            maxOpenPagesPerBrowser: 10,
            useFingerprints: true,
        });

        const pages: any[] = [];
        const userAgents: string[] = [];

        try {
            for (let i = 0; i < 3; i++) {
                const page = await pool.newPage();
                pages.push(page);
                const ua = await page.evaluate(() => navigator.userAgent);
                userAgents.push(ua);
            }

            // For non-incognito, all pages share the same browser fingerprint (expected behavior)
            const uniqueUserAgents = new Set(userAgents);
            console.log('Non-incognito user agents:', userAgents);
            expect(uniqueUserAgents.size).toBe(1); // All pages share the same browser UA
        } finally {
            for (const page of pages) {
                await page.close().catch(() => {});
            }
            await pool.destroy();
        }
    }, 60_000);
});

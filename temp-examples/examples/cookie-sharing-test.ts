/**
 * Cookie sharing test — useIncognitoPages: false with remote CDP (Puppeteer)
 *
 * Tests that cookies set on one page are visible on another page within the
 * same browser session, comparing local vs remote behavior.
 *
 * Run local Browserless first:
 *   docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Then:
 *   npm run example:cookie-sharing-test
 */
import { PuppeteerPlugin, BrowserPool, RemoteBrowserProvider } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';

const BROWSERLESS_URL = 'ws://localhost:3000';

// ---------------------------------------------------------------------------
// Helper: open two pages in the same browser, set cookie on page A,
// check if page B can see it without explicit transfer.
// ---------------------------------------------------------------------------
async function testCookieSharing(label: string, plugin: PuppeteerPlugin) {
    console.log(`\n--- ${label} ---`);

    const pool = new BrowserPool({
        browserPlugins: [plugin],
        maxOpenPagesPerBrowser: 2,
    });

    try {
        // Page A — set a cookie
        const pageA = await pool.newPage();
        await pageA.goto('https://example.com', { waitUntil: 'domcontentloaded' });

        const controllerA = pool.getBrowserControllerByPage(pageA)!;
        await controllerA.setCookies(pageA, [
            { name: 'SHARED_TEST', value: 'from-page-a', domain: '.example.com' },
        ]);

        const cookiesA = await controllerA.getCookies(pageA);
        console.log(`Page A cookies: ${JSON.stringify(cookiesA.map((c) => ({ name: c.name, value: c.value })))}`);

        // Page B — same browser, check if cookie is visible
        const pageB = await pool.newPage();
        await pageB.goto('https://example.com', { waitUntil: 'domcontentloaded' });

        const controllerB = pool.getBrowserControllerByPage(pageB)!;

        // Verify both pages are in the same browser
        const sameBrowser = controllerA === controllerB;
        console.log(`Same browser controller: ${sameBrowser}`);

        const cookiesB = await controllerB.getCookies(pageB);
        console.log(`Page B cookies: ${JSON.stringify(cookiesB.map((c) => ({ name: c.name, value: c.value })))}`);

        const found = cookiesB.find((c) => c.name === 'SHARED_TEST');
        if (found) {
            console.log(`✅ PASS — Cookie shared between pages (value: "${found.value}")`);
        } else {
            console.log(`❌ FAIL — Cookie NOT visible on page B`);
        }

        await pageA.close();
        await pageB.close();
    } finally {
        await pool.destroy();
    }
}

// ---------------------------------------------------------------------------
// Test 1: Local browser, useIncognitoPages: false (baseline)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Local Puppeteer — useIncognitoPages: false',
    new PuppeteerPlugin(puppeteer, { useIncognitoPages: false }),
);

// ---------------------------------------------------------------------------
// Test 2: Remote CDP (Browserless), useIncognitoPages: false
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Remote CDP (Browserless) — useIncognitoPages: false',
    new PuppeteerPlugin(puppeteer, {
        useIncognitoPages: false,
        connectOverCDPOptions: { browserWSEndpoint: BROWSERLESS_URL },
    }),
);

// ---------------------------------------------------------------------------
// Test 3: Remote CDP (Browserless), useIncognitoPages: true (should NOT share)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Remote CDP (Browserless) — useIncognitoPages: true',
    new PuppeteerPlugin(puppeteer, {
        useIncognitoPages: true,
        connectOverCDPOptions: { browserWSEndpoint: BROWSERLESS_URL },
    }),
);

// ---------------------------------------------------------------------------
// Test 4: Remote via RemoteBrowserProvider, useIncognitoPages: false
// ---------------------------------------------------------------------------
class BrowserlessProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 2;
    async connect() {
        return { url: BROWSERLESS_URL };
    }
}

await testCookieSharing(
    'RemoteBrowserProvider (Browserless) — useIncognitoPages: false',
    new PuppeteerPlugin(puppeteer, {
        useIncognitoPages: false,
        remoteBrowser: new BrowserlessProvider(),
    }),
);

console.log('\nDone.');

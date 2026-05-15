/**
 * Cookie sharing test — Playwright: CDP vs WebSocket, incognito true vs false
 *
 * Tests whether cookies set on page A are visible on page B within the same
 * browser, across all four combinations:
 *   1. Playwright CDP        + useIncognitoPages: false  → should share
 *   2. Playwright CDP        + useIncognitoPages: true   → should NOT share
 *   3. Playwright WebSocket  + useIncognitoPages: false  → ???  (connect() has no default context)
 *   4. Playwright WebSocket  + useIncognitoPages: true   → should NOT share
 *
 * Run local Browserless first:
 *   docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Then:
 *   npm run example:cookie-sharing-playwright-test
 */
import { PlaywrightPlugin, BrowserPool, RemoteBrowserProvider } from '@crawlee/browser-pool';
import playwright from 'playwright';

const BROWSERLESS_CDP = 'ws://localhost:3000';
const BROWSERLESS_WS = 'ws://localhost:3000/chromium/playwright';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function testCookieSharing(label: string, plugin: PlaywrightPlugin) {
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
            { name: 'SHARED_TEST', value: 'from-page-a', domain: '.example.com', path: '/' },
        ]);

        const cookiesA = await controllerA.getCookies(pageA);
        console.log(`Page A cookies: ${JSON.stringify(cookiesA.map((c) => ({ name: c.name, value: c.value })))}`);

        // Page B — same browser, check if cookie is visible
        const pageB = await pool.newPage();
        await pageB.goto('https://example.com', { waitUntil: 'domcontentloaded' });

        const controllerB = pool.getBrowserControllerByPage(pageB)!;
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
// 1. Playwright CDP — useIncognitoPages: false (should share)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Playwright CDP — useIncognitoPages: false',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: false,
        connectOverCDPOptions: { endpointURL: BROWSERLESS_CDP },
    }),
);

// ---------------------------------------------------------------------------
// 2. Playwright CDP — useIncognitoPages: true (should NOT share)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Playwright CDP — useIncognitoPages: true',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: true,
        connectOverCDPOptions: { endpointURL: BROWSERLESS_CDP },
    }),
);

// ---------------------------------------------------------------------------
// 3. Playwright WebSocket — useIncognitoPages: false (the question mark)
//    connect() returns a browser with no default context — does newPage()
//    create an implicit shared context, or a new one each time?
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Playwright WebSocket — useIncognitoPages: false',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: false,
        connectOptions: { wsEndpoint: BROWSERLESS_WS },
    }),
);

// ---------------------------------------------------------------------------
// 4. Playwright WebSocket — useIncognitoPages: true (should NOT share)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Playwright WebSocket — useIncognitoPages: true',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: true,
        connectOptions: { wsEndpoint: BROWSERLESS_WS },
    }),
);

console.log('\nDone.');

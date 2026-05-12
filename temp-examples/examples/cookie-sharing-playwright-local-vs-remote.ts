/**
 * Cookie sharing: Playwright local vs remote
 *
 * Compares whether cookies set on page A are visible on page B within the
 * same browser for local (launchPersistentContext) vs remote (connect/CDP).
 *
 * Run local Browserless first:
 *   docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Then:
 *   npm run example:cookie-sharing-playwright-local-vs-remote
 */
import { PlaywrightPlugin, BrowserPool } from '@crawlee/browser-pool';
import playwright from 'playwright';

const BROWSERLESS_CDP = 'ws://localhost:3000';

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
        console.log(`Same browser controller: ${controllerA === controllerB}`);

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
// 1. Local — useIncognitoPages: false (launchPersistentContext → shared context)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Local Playwright — useIncognitoPages: false (persistent context)',
    new PlaywrightPlugin(playwright.chromium, { useIncognitoPages: false }),
);

// ---------------------------------------------------------------------------
// 2. Local — useIncognitoPages: true (new context per page)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Local Playwright — useIncognitoPages: true',
    new PlaywrightPlugin(playwright.chromium, { useIncognitoPages: true }),
);

// ---------------------------------------------------------------------------
// 3. Remote CDP — useIncognitoPages: false (browser.newPage() = new context anyway)
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Remote CDP Playwright — useIncognitoPages: false',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: false,
        connectOverCDPOptions: { endpointURL: BROWSERLESS_CDP },
    }),
);

// ---------------------------------------------------------------------------
// 4. Remote CDP — useIncognitoPages: true
// ---------------------------------------------------------------------------
await testCookieSharing(
    'Remote CDP Playwright — useIncognitoPages: true',
    new PlaywrightPlugin(playwright.chromium, {
        useIncognitoPages: true,
        connectOverCDPOptions: { endpointURL: BROWSERLESS_CDP },
    }),
);

console.log('\n--- Summary ---');
console.log('Local  incognito:false  → shared (launchPersistentContext)');
console.log('Local  incognito:true   → isolated');
console.log('Remote incognito:false  → shared (wrapped default context from CDP)');
console.log('Remote incognito:true   → isolated');
console.log('\nDone.');

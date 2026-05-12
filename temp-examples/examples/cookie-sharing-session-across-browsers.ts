/**
 * Session-based cookie sharing across remote browsers (Puppeteer)
 *
 * Demonstrates that the Session object transfers cookies between sequential
 * requests even when they land on different browser instances.
 *
 * Setup:
 *   - retireBrowserAfterPageCount: 1 → forces a new browser per request
 *   - Single session pool → same session reused for all requests
 *   - saveResponseCookies: true (default)
 *
 * Run local Browserless first:
 *   docker run -p 3000:3000 -e CONCURRENT=4 ghcr.io/browserless/chromium
 *
 * Then:
 *   npm run example:cookie-sharing-session-across-browsers
 */
import { RemoteBrowserProvider } from '@crawlee/browser-pool';
import { PuppeteerCrawler, SessionPool } from 'crawlee';

// ---------------------------------------------------------------------------
// Remote browser provider
// ---------------------------------------------------------------------------
class BrowserlessProvider extends RemoteBrowserProvider {
    maxOpenBrowsers = 4;
    async connect() {
        return { url: 'ws://localhost:3000' };
    }
}

// Single session so both requests share cookies
const sessionPool = new SessionPool({ maxPoolSize: 1 });

// ---------------------------------------------------------------------------
// Crawler — forces new browser per request to prove cross-browser sharing
// ---------------------------------------------------------------------------
const crawler = new PuppeteerCrawler({
    launchContext: {
        remoteBrowser: new BrowserlessProvider(),
    },
    browserPoolOptions: {
        retireBrowserAfterPageCount: 1, // force new browser for each request
        maxOpenPagesPerBrowser: 1,
    },
    sessionPool,
    maxConcurrency: 1, // sequential — so request 1 finishes before request 2
    async requestHandler({ page, request, session, browserController }) {
        const controllerId = browserController.id;

        // Set a cookie manually on the first request and save it to the session
        if (request.url.includes('/login')) {
            await page.setCookie({
                name: 'AUTH_TOKEN',
                value: 'secret-jwt-123',
                domain: 'books.toscrape.com',
                path: '/',
            });
            // Save page cookies to the session (normally saveResponseCookies does this
            // during navigation, but our cookie was set after navigation)
            const cookies = await browserController.getCookies(page);
            session?.setCookies(cookies, request.loadedUrl!);
        }

        const pageCookies = await page.cookies();
        const sessionCookies = session?.getCookies(request.loadedUrl!) ?? [];

        console.log(`\n[${new URL(request.url).pathname}]`);
        console.log(`  Browser controller: ${controllerId}`);
        console.log(`  Session ID: ${session?.id}`);
        console.log(`  Page cookies: ${JSON.stringify(pageCookies.map((c) => ({ name: c.name, value: c.value })))}`);
        console.log(`  Session cookies: ${JSON.stringify(sessionCookies.map((c) => ({ name: c.name, value: c.value })))}`);
    },
});

await crawler.run([
    'https://books.toscrape.com/login',  // Request 1: browser A — sets AUTH_TOKEN cookie
    'https://books.toscrape.com/',        // Request 2: browser B — should have cookie via Session
]);

console.log('\nDone.');
console.log('If request 2 shows AUTH_TOKEN in session cookies → session transferred cookies across browsers.');
console.log('Check that Browser controller IDs are different → proves different browsers.');

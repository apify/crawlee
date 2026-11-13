import { BrowserFetchHttpClient, CheerioCrawler, playwrightBrowserPool, SessionPool } from 'crawlee';

const browserPool = playwrightBrowserPool();

const crawler = new CheerioCrawler({
    httpClient: new BrowserFetchHttpClient({
        browserPool,
        // Runs before the first request of every session
        async login(page) {
            await page.goto('https://example.com/login');
            await page.fill('#username', process.env.USERNAME!);
            await page.fill('#password', process.env.PASSWORD!);
            await page.click('button[type=submit]');
            await page.waitForURL('https://example.com/account');
        },
    }),
    // Keep using a logged-in session until the site rejects it
    sessionPool: new SessionPool({ sessionReuseStrategy: 'use-until-failure' }),
    async requestHandler({ $, request }) {
        console.log(`${request.url}: ${$('title').text()}`);
    },
});

await crawler.run(['https://example.com/account']);
await browserPool.destroy();

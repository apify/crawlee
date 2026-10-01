import { BrowserFetchHttpClient, CheerioCrawler } from 'crawlee';
import { type BrowserContext, chromium } from 'playwright';

const login = async (context: BrowserContext) => {
    const page = await context.newPage();
    await page.goto('https://example.com/login');
    await page.fill('#username', process.env.USERNAME!);
    await page.fill('#password', process.env.PASSWORD!);
    await Promise.all([page.waitForURL('https://example.com/account'), page.click('button[type=submit]')]);
    await page.close();
};

const browser = await chromium.launch();
const context = await browser.newContext();
await login(context);

let relogin: Promise<void> | undefined;

const crawler = new CheerioCrawler({
    httpClient: new BrowserFetchHttpClient({ context }),
    // A 401 means the session expired, log in once for all the requests that got it before they are retried
    async errorHandler({ response }) {
        if (response?.status !== 401) return;
        relogin ??= login(context).finally(() => {
            relogin = undefined;
        });
        await relogin;
    },
    async requestHandler({ $, request }) {
        console.log(`${request.url}: ${$('title').text()}`);
    },
});

await crawler.run(['https://example.com/account']);
await browser.close();

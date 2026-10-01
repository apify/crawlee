import { BrowserFetchHttpClient, CheerioCrawler } from 'crawlee';
import { chromium, type Page } from 'playwright';

const login = async (page: Page) => {
    await page.goto('https://example.com/login');
    await page.fill('#username', process.env.USERNAME!);
    await page.fill('#password', process.env.PASSWORD!);
    await Promise.all([page.waitForURL('https://example.com/account'), page.click('button[type=submit]')]);
};

const browser = await chromium.launch();
const page = await browser.newPage();
await login(page);

const crawler = new CheerioCrawler({
    // `login` runs again when a request gets a 401 response
    httpClient: new BrowserFetchHttpClient({ page, login }),
    async requestHandler({ $, request }) {
        console.log(`${request.url}: ${$('title').text()}`);
    },
});

await crawler.run(['https://example.com/account']);
await browser.close();

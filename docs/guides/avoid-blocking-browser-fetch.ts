import { PlaywrightCrawler, SessionError, SessionPool } from 'crawlee';
import type { Page } from 'playwright';

const logIn = async (page: Page) => {
    await page.goto('https://example.com/login');
    await page.fill('#username', process.env.USERNAME!);
    await page.fill('#password', process.env.PASSWORD!);
    await page.click('button[type=submit]');
    await page.waitForURL('https://example.com/account');
};

const logins = new Map<string, Promise<void>>();

const crawler = new PlaywrightCrawler({
    sessionPool: new SessionPool({ sessionReuseStrategy: 'use-until-failure' }),
    preNavigationHooks: [
        async ({ page, session }) => {
            if (!logins.has(session.id)) logins.set(session.id, logIn(page));
            await logins.get(session.id);

            // Serve an empty document instead of loading the page
            await page.route('**', async (route) => route.fulfill({ body: '' }), { times: 1 });
        },
    ],
    async requestHandler({ page, request, pushData }) {
        const { status, body } = await page.evaluate(async (url) => {
            const response = await fetch(url);
            return { status: response.status, body: await response.text() };
        }, request.url);

        if (status === 401) throw new SessionError('Logged out');

        await pushData(JSON.parse(body));
    },
});

await crawler.run(['https://example.com/api/orders?page=1', 'https://example.com/api/orders?page=2']);

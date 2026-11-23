import { PlaywrightCrawler, SessionPool } from 'crawlee';
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
    postNavigationHooks: [
        async ({ page, request }) => {
            const [response] = await Promise.all([
                page.waitForResponse(request.url),
                page.evaluate(async (url) => {
                    await fetch(url);
                }, request.url),
            ]);

            // Follow redirects to the final response
            let fetchRequest = response.request();
            while (fetchRequest.redirectedTo()) fetchRequest = fetchRequest.redirectedTo()!;

            // Replace the empty document's response with the one from `fetch()`
            return { response: (await fetchRequest.response())! };
        },
    ],
    async requestHandler({ response, pushData }) {
        await pushData(await response.json());
    },
});

await crawler.run(['https://example.com/api/orders?page=1', 'https://example.com/api/orders?page=2']);

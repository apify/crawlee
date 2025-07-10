import { HttpUser } from './packages/http-crawler/dist/internals/http-user.js';
import { CheerioCrawler, UserPool } from './packages/cheerio-crawler/dist/index.js';
import { Cookie } from 'tough-cookie';

(async () => {
    const crawler = new CheerioCrawler({
        userPool: new UserPool([
            new HttpUser({ id: 'alice' }),
            new HttpUser({ id: 'bob' }),
            new HttpUser({ id: 'charlie' }),
        ]),
        preNavigationHooks: [
            async ({ request: { userId }, cookieJar }) => {
                if (userId === 'alice') {
                    cookieJar.setCookieSync(
                        new Cookie({
                            key: 'custom-cookie',
                            value: 'from-the-white-rabbit',
                        }),
                        'https://httpbin.org',
                    );
                }
            },
        ],
        requestHandler: async ({ body, log }) => {
            log.info(body);
        },
        maxConcurrency: 1,
    });

    await crawler.run([
        {
            url: 'https://httpbin.org/cookies/set?alice=in-the-wonderland',
            userId: 'alice',
        },
        {
            url: 'https://httpbin.org/cookies/set?bob=the-builder',
            userId: 'bob',
        },
        {
            url: 'https://httpbin.org/cookies/set?charlie=and-the-chocolate-factory',
            userId: 'charlie',
        },
        {
            url: 'https://httpbin.org/cookies',
        },
    ]);
})();

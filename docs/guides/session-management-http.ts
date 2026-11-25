import { HttpCrawler, ProxyConfiguration, Session, SessionPool } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({/* opts */});

const crawler = new HttpCrawler({
    // Overrides default Session pool configuration. A custom pool must assign proxies to its sessions itself.
    sessionPool: new SessionPool({
        maxPoolSize: 100,
        createSessionFunction: async (opts) =>
            new Session({ ...opts?.sessionOptions, proxyInfo: await proxyConfiguration.newProxyInfo() }),
    }),
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookie header to request automatically (default is true).
    saveResponseCookies: true,
    async requestHandler({ session, body }) {
        const title = /<title(?:.*?)>(.*?)<\/title>/.exec(body as string)?.[1];

        if (title === 'Blocked') {
            session?.retire();
        } else if (title === 'Not sure if blocked, might also be a connection error') {
            session?.markBad();
        } else {
            // session.markGood() - this step is done automatically in BasicCrawler.
        }
    },
});

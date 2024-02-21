import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });

const crawler = new PlaywrightCrawler({
    // To use the proxy IP session rotation logic, you must turn the proxy usage on.
    proxyConfiguration,
    // Activates the Session pool (default is true).
    useSessionPool: true,
    // Overrides default Session pool configuration
    sessionPoolOptions: { maxPoolSize: 100 },
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookies to page before navigation automatically (default is true).
    persistCookiesPerSession: true,
    async requestHandler({ page, session }) {
        const title = await page.title();

        if (title === 'Blocked') {
            session.retire();
        } else if (title === 'Not sure if blocked, might also be a connection error') {
            session.markBad();
        } else {
            // session.markGood() - this step is done automatically in PlaywrightCrawler.
        }
    },
});

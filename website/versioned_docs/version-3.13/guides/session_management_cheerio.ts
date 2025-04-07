import { CheerioCrawler, ProxyConfiguration } from 'crawlee';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new CheerioCrawler({
    // To use the proxy IP session rotation logic, you must turn the proxy usage on.
    proxyConfiguration,
    // Activates the Session pool (default is true).
    useSessionPool: true,
    // Overrides default Session pool configuration.
    sessionPoolOptions: { maxPoolSize: 100 },
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookie header to request automatically (default is true).
    persistCookiesPerSession: true,
    async requestHandler({ session, $ }) {
        const title = $('title').text();

        if (title === 'Blocked') {
            session.retire();
        } else if (title === 'Not sure if blocked, might also be a connection error') {
            session.markBad();
        } else {
            // session.markGood() - this step is done automatically in BasicCrawler.
        }
    },
});

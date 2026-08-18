"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const got_scraping_1 = require("got-scraping");
const proxyConfiguration = new crawlee_1.ProxyConfiguration({ /* opts */});
const crawler = new crawlee_1.BasicCrawler({
    // Activates the Session pool (default is true).
    useSessionPool: true,
    // Overrides default Session pool configuration.
    sessionPoolOptions: { maxPoolSize: 100 },
    async requestHandler({ request, session }) {
        const { url } = request;
        const requestOptions = {
            url,
            // We use session id in order to have the same proxyUrl
            // for all the requests using the same session.
            proxyUrl: await proxyConfiguration.newUrl(session.id),
            throwHttpErrors: false,
            headers: {
                // If you want to use the cookieJar.
                // This way you get the Cookie headers string from session.
                Cookie: session.getCookieString(url),
            },
        };
        let response;
        try {
            response = await (0, got_scraping_1.gotScraping)(requestOptions);
        }
        catch (e) {
            if (e === 'SomeNetworkError') {
                // If a network error happens, such as timeout, socket hangup, etc.
                // There is usually a chance that it was just bad luck
                // and the proxy works. No need to throw it away.
                session.markBad();
            }
            throw e;
        }
        // Automatically retires the session based on response HTTP status code.
        session.retireOnBlockedStatusCodes(response.statusCode);
        if (response.body.blocked) {
            // You are sure it is blocked.
            // This will throw away the session.
            session.retire();
        }
        // Everything is ok, you can get the data.
        // No need to call session.markGood -> BasicCrawler calls it for you.
        // If you want to use the CookieJar in session you need.
        session.setCookiesFromResponse(response);
    },
});

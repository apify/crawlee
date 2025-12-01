import { BasicCrawler, ProxyConfiguration } from 'crawlee';
import { Impit } from 'impit';
import { Cookie } from 'tough-cookie';

const proxyConfiguration = new ProxyConfiguration({
    /* opts */
});

const crawler = new BasicCrawler({
    // Activates the Session pool (default is true).
    useSessionPool: true,
    // Overrides default Session pool configuration.
    sessionPoolOptions: { maxPoolSize: 100 },
    async requestHandler({ request, session }) {
        const { url } = request;
        const client = new Impit({
            proxyUrl: await proxyConfiguration.newUrl(),
            ignoreTlsErrors: true,
            headers: {
                // If you want to use the cookieJar.
                // This way you get the Cookie headers string from session.
                Cookie: session?.getCookieString(url) ?? '',
            },
        });
        let response;

        try {
            response = await client.fetch(url);
        } catch (e) {
            if (e === 'SomeNetworkError') {
                // If a network error happens, such as timeout, socket hangup, etc.
                // There is usually a chance that it was just bad luck
                // and the proxy works. No need to throw it away.
                session?.markBad();
            }
            throw e;
        }

        // Automatically retires the session based on response HTTP status code.
        session?.retireOnBlockedStatusCodes(response.status);

        if ((await response.text()).includes('You are blocked!')) {
            // You are sure it is blocked.
            // This will throw away the session.
            session?.retire();
        }

        // Everything is ok, you can get the data.
        // No need to call session.markGood -> BasicCrawler calls it for you.

        // If you want to use the CookieJar in session you need.
        if (response.headers.has('set-cookie')) {
            const newCookies = response.headers
                .get('set-cookie')
                ?.split(';')
                .map((x) => Cookie.parse(x));

            newCookies?.forEach((cookie) => {
                if (cookie) {
                    session?.cookieJar?.setCookie(cookie, url);
                }
            });
        }
    },
});

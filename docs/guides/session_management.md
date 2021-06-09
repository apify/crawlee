---
id: session-management
title: Session Management
---
[`SessionPool`](../api/session-pool) is a class that allows you to handle the rotation of proxy IP addresses along with cookies and other custom settings in Apify SDK.

The main benefit of a Session pool is that you can filter out blocked or non-working proxies,
so your actor does not retry requests over known blocked/non-working proxies.
Another benefit of using SessionPool is that you can store information tied tightly to an IP address,
such as cookies, auth tokens, and particular headers. Having your cookies and other identificators used only with a specific IP will reduce the chance of being blocked.
Last but not least, another benefit is the even rotation of IP addresses - SessionPool  picks the session randomly,
which should prevent burning out a small pool of available IPs.

Now let's take a look at how to use a Session pool.

**Example usage in [`PuppeteerCrawler`](../api/puppeteer-crawler)**

```javascript

const proxyConfiguration = await Apify.createProxyConfiguration();

const crawler = new Apify.PuppeteerCrawler({
    requestQueue,
    // To use the proxy IP session rotation logic, you must turn the proxy usage on.
    proxyConfiguration,
    // Activates the Session pool.
    useSessionPool: true,
    // Overrides default Session pool configuration
    sessionPoolOptions: {
        maxPoolSize: 100
    },
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookies to page before navigation automatically.
    persistCookiesPerSession: true,
    handlePageFunction: async ({ request, page, session }) => {
        const title = await page.title();

        if (title === "Blocked") {
            session.retire()
        } else if (title === "Not sure if blocked, might also be a connection error") {
            session.markBad();
        } else {
            // session.markGood() - this step is done automatically in puppeteer pool.
        }

    }
});
```

**Example usage in [`CheerioCrawler`](../api/cheerio-crawler)**

```javascript
  const proxyConfiguration = await Apify.createProxyConfiguration();

  const crawler = new Apify.CheerioCrawler({
        requestQueue,
        // To use the proxy IP session rotation logic, you must turn the proxy usage on.
        proxyConfiguration,
        // Activates the Session pool.
        useSessionPool: true,
        // Overrides default Session pool configuration.
        sessionPoolOptions: {
            maxPoolSize: 100
        },
        // Set to true if you want the crawler to save cookies per session,
        // and set the cookie header to request automatically...
        persistCookiesPerSession: true,
        handlePageFunction: async ({request, $, session}) => {
            const title = $("title");

            if (title === "Blocked") {
                session.retire()
            } else if (title === "Not sure if blocked, might also be a connection error") {
                session.markBad();
            } else {
                // session.markGood() - this step is done automatically in BasicCrawler.
            }

        }
    });
```

**Example usage in [`BasicCrawler`](../api/basic-crawler)**

```javascript
 const proxyConfiguration = await Apify.createProxyConfiguration();

 const crawler = new Apify.BasicCrawler({
        requestQueue,
        // Allows access to proxyInfo object in handleRequestFunction
        proxyConfiguration,
        useSessionPool: true,
        sessionPoolOptions: {
            maxPoolSize: 100
        },
        handleRequestFunction: async ({request, session, proxyInfo }) => {
            // To use the proxy IP session rotation logic, you must turn the proxy usage on.
            const proxyUrl = proxyInfo.url;
            const requestOptions = {
                url: request.url,
                proxyUrl,
                throwHttpErrors: false,
                headers: {
                    // If you want to use the cookieJar.
                    // This way you get the Cookie headers string from session.
                    Cookie: session.getCookieString(),
                }
            };
            let response;

            try {
                response = await Apify.utils.requestAsBrowser(requestOptions);
            } catch (e) {
                if (e === "SomeNetworkError") {
                    // If a network error happens, such as timeout, socket hangup etc...
                    // There is usually a chance that it was just bad luck and the proxy works.
                    // No need to throw it away.
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

        }
    });
```

**Example solo usage**

```javascript
Apify.main(async () => {

    const sessionPoolOptions = {
            maxPoolSize: 100
    };
    const sessionPool = await Apify.openSessionPool(sessionPoolOptions);

    // Get session
    const session = sessionPool.getSession();

    // Increase the errorScore.
    session.markBad();

    // Throw away the session
    session.retire();

    // Lower the errorScore and marks the session good.
    session.markGood();
});
```
These are the basics of configuring SessionPool.
Please, bear in mind that a Session pool needs time to find working IPs and build up the pool,
so you will probably see a lot of errors until it becomes stabilized.

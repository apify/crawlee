---
id: sessionmanagement
title: Session Management
---
[`SessionPool`](../api/sessionpool) is a class that allows you to handle the rotation of proxy IP addresses together with cookies and other custom settings in Apify SDK.

The main benefit of the Session pool is that you can filter out blocked or not working proxies,
so your actor does not retry requests over a known blocked/not working proxies.
Another benefit of using SessionPool is storing information tight tightly with the IP address,
such as cookies, auth tokens, and particular headers. Having your cookies and other identificators used only with specific IP will reduce the chance of the blocking.
Last but not least, another benefit is even rotation of the IP addresses - SessionPool  picks the session randomly,
 which should prevent burning out only a small pool of the available IPs.

Now let's take a look at how to use the Session pool.

**Example usage in [`PuppeteerCrawler`](../api/puppeteercrawler)**

```javascript
const crawler = new Apify.PuppeteerCrawler({
    requestQueue,
    launchPuppeteerOptions: {
        // To use the proxy IP session rotation logic you must turn the proxy usage on.
        useApifyProxy: true,
    },
    // Activates the Session pool.
    useSessionPool: true,
    // Overrides default Session pool configuration
    sessionPoolOptions: {
        maxPoolSize: 100
    },
    // Set to true if you want the crawler to save cookies per session,
    // and set the cookies to page before navigation automatically.
    persistCookiesPerSession: true,
    handlePageFunction: async ({request, page, session}) => {
        const title = await page.title();

        if (title === "Blocked") {
            session.retire()
        } else if (title === "Not sure if blocked, might be also connection error") {
            session.markBad();
        } else {
            // session.markGood() - this step is done automatically in puppeteer pool.
        }

    }
});
```

**Example usage in [`CheerioCrawler`](../api/cheeriocrawler)**

```javascript
  const crawler = new Apify.CheerioCrawler({
        requestQueue,
        // To use the proxy IP session rotation logic you must turn the proxy usage on.
        useApifyProxy: true,
        // Activates the Session pool.
        useSessionPool: true,
        // Overrides default Session pool configuration
        sessionPoolOptions: {
            maxPoolSize: 100
        },
        // Set to true if you want the crawler to save cookies per session,
        // and set the cookie header to request automatically..
        persistCookiesPerSession: true,
        handlePageFunction: async ({request, $, session}) => {
            const title = $("title");

            if (title === "Blocked") {
                session.retire()
            } else if (title === "Not sure if blocked, might be also connection error") {
                session.markBad();
            } else {
                // session.markGood() - this step is done automatically in BasicCrawler.
            }

        }
    });
```

**Example usage in [`BasicCrawler`](../api/basiccrawler)**

```javascript
Finish API first
```

**Example solo usage**

```javascript
Finish API first
```

These are the basics of configuring the SessionPool.
Please, bear in mind that the Session pool needs some time to find the working IPs and build up the pool,
so you will be probably seeing a lot of errors until it gets stabilized.

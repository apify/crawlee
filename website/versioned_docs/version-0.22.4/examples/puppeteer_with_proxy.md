---
id: version-0.22.4-puppeteer-with-proxy
title: Puppeteer with proxy
original_id: puppeteer-with-proxy
---

This example demonstrates how to load pages in headless Chrome / Puppeteer over [Apify Proxy](https://docs.apify.com/proxy). To make it work, you'll
need an Apify account with access to the proxy. Visit the [Apify platform introduction](/docs/guides/apify-platform) to find how to log into your
account from the SDK.

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestList = await Apify.openRequestList('my-list', ['https://en.wikipedia.org/wiki/Main_Page']);
    const proxyConfiguration = await Apify.createProxyConfiguration();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        proxyConfiguration,
        handlePageFunction: async ({ page }) => {
            const title = await page.title();
            console.log(`Page title: ${title}`);
        },
    });

    console.log('Running Puppeteer script...');
    await crawler.run();
    console.log('Puppeteer closed.');
});
```

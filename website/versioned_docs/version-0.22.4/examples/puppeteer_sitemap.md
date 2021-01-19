---
id: version-0.22.4-puppeteer-sitemap
title: Puppeteer sitemap
original_id: puppeteer-sitemap
---

This example demonstrates how to use [`PuppeteerCrawler`](/docs/api/puppeteer-crawler) to crawl a list of web pages specified in a sitemap. The
crawler extracts the page title and URL from each page and stores them as a record in the default dataset. In local configuration, the results are
stored as JSON files in `./apify_storage/datasets/default`.

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: 'https://apify.com/sitemaps.xml' }],
    });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        maxRequestsPerCrawl: 10,
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);
            await Apify.pushData({
                url: request.url,
                title: await page.title(),
                html: await page.content(),
            });
        },
    });

    await crawler.run();
    console.log('Done.');
});
```

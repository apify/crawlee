---
id: puppeteersitemap
title: Puppeteer Sitemap
---

This example demonstrates how to use [`PuppeteerCrawler`](../api/puppeteercrawler) to crawl a list of web pages specified in a sitemap. The crawler
extracts page title and URL from each page and stores them as a record to the default dataset. In local configuration, the results are stored as JSON
files in `./apify_storage/datasets/default`

To run this example on the Apify Platform, select the `Node.js 10 + Chrome on Debian (apify/actor-node-chrome)` base image on the source tab of your
actor configuration.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: 'https://edition.cnn.com/sitemaps/cnn/news.xml' }],
    });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
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

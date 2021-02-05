---
id: version-1.0.1-puppeteer-recursive-crawl
title: Puppeteer recursive crawl
original_id: puppeteer-recursive-crawl
---

Run the following example to perform a recursive crawl of a website using [`PuppeteerCrawler`](/docs/api/puppeteer-crawler).

> To run this example on the Apify Platform, select the `apify/actor-node-puppeteer-chrome` image for your Dockerfile.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.iana.org/' });

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageFunction: async ({ request, page }) => {
            const title = await page.title();
            console.log(`Title of ${request.url}: ${title}`);
            await Apify.utils.enqueueLinks({
                page,
                requestQueue,
                pseudoUrls: ['https://www.iana.org/[.*]'],
            });
        },
        maxRequestsPerCrawl: 10,
    });

    await crawler.run();
});
```

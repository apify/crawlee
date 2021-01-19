---
id: version-0.22.4-puppeteer-recursive-crawl
title: Puppeteer recursive crawl
original_id: puppeteer-recursive-crawl
---

Run the following example to perform a recursive crawl of a website using [`PuppeteerCrawler`](/docs/api/puppeteer-crawler).

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://www.iana.org/' });
    const pseudoUrls = [new Apify.PseudoUrl('https://www.iana.org/[.*]')];

    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageFunction: async ({ request, page }) => {
            const title = await page.title();
            console.log(`Title of ${request.url}: ${title}`);
            await Apify.utils.enqueueLinks({
                page,
                selector: 'a',
                pseudoUrls,
                requestQueue,
            });
        },
        maxRequestsPerCrawl: 10,
        maxConcurrency: 10,
    });

    await crawler.run();
});
```

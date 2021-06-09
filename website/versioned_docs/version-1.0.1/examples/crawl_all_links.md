---
id: version-1.0.1-crawl-all-links
title: Crawl all links on a website
original_id: crawl-all-links
---

This example uses the `Apify.enqueueLinks()` method to add new links to the `RequestQueue` as the crawler navigates from page to page. If only the
required parameters are defined, all links will be crawled.

<!--DOCUSAURUS_CODE_TABS-->

<!-- CheerioCrawler -->

\
Using `CheerioCrawler`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestQueue
    const requestQueue = await Apify.openRequestQueue();
    // Define the starting URL
    await requestQueue.addRequest({ url: 'https://apify.com/' });
    // Function called for each URL
    const handlePageFunction = async ({ request, $ }) => {
        console.log(request.url);
        // Add all links from page to RequestQueue
        await Apify.utils.enqueueLinks({
            $,
            requestQueue,
            baseUrl: request.loadedUrl,
        });
    };
    // Create a CheerioCrawler
    const crawler = new Apify.CheerioCrawler({
        requestQueue,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
    });
    // Run the crawler
    await crawler.run();
});
```

<!-- PuppeteerCrawler -->

\
Using `PuppeteerCrawler`:

> To run this example on the Apify Platform, select the `apify/actor-node-puppeteer-chrome` image for your Dockerfile.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestQueue
    const requestQueue = await Apify.openRequestQueue();
    // Define the starting URL
    await requestQueue.addRequest({ url: 'https://apify.com/' });
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        console.log(request.url);
        // Add all links from page to RequestQueue
        await Apify.utils.enqueueLinks({
            page,
            requestQueue,
        });
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
    });
    // Run the crawler
    await crawler.run();
});
```

<!-- PlaywrightCrawler -->

\
Using `PlaywrightCrawler`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestQueue
    const requestQueue = await Apify.openRequestQueue();
    // Define the starting URL
    await requestQueue.addRequest({ url: 'https://apify.com/' });
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        console.log(request.url);
        // Add all links from page to RequestQueue
        await Apify.utils.enqueueLinks({
            page,
            requestQueue,
        });
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PlaywrightCrawler({
        requestQueue,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl all links)
    });
    // Run the crawler
    await crawler.run();
});
```

> To run this example on the Apify Platform, select the `apify/actor-node-playwright-chrome` image for your Dockerfile.

<!--END_DOCUSAURUS_CODE_TABS-->

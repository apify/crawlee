---
id: version-1.0.1-crawl-sitemap
title: Crawl a sitemap
original_id: crawl-sitemap
---

This example downloads and crawls the URLs from a sitemap.

<!--DOCUSAURUS_CODE_TABS-->

<!-- CheerioCrawler -->

\
Using `CheerioCrawler`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Add URLs to a RequestList from a sitemap
    const sources = [{ requestsFromUrl: 'https://apify.com/sitemap.xml' }];
    const requestList = await Apify.openRequestList('start-urls', sources);

    // Function called for each URL
    const handlePageFunction = async ({ request }) => {
        console.log(request.url);
    };

    // Create a crawler that uses Cheerio
    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl a sitemap)
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
    // Add URLs to a RequestList from a sitemap
    const sources = [{ requestsFromUrl: 'https://apify.com/sitemap.xml' }];
    const requestList = await Apify.openRequestList('start-urls', sources);

    // Function called for each URL
    const handlePageFunction = async ({ request }) => {
        console.log(request.url);
    };

    // Create a crawler that runs Puppeteer
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl a sitemap)
    });

    // Run the crawler
    await crawler.run();
});
```

<!-- PlaywrightCrawler -->

\
Using `PlaywrightCrawler`:

> To run this example on the Apify Platform, select the `apify/actor-node-playwright-chrome` image for your Dockerfile.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Add URLs to a RequestList from a sitemap
    const sources = [{ requestsFromUrl: 'https://apify.com/sitemap.xml' }];
    const requestList = await Apify.openRequestList('start-urls', sources);

    // Function called for each URL
    const handlePageFunction = async ({ request }) => {
        console.log(request.url);
    };

    // Create a crawler that runs Playwright
    const crawler = new Apify.PlaywrightCrawler({
        requestList,
        handlePageFunction,
        maxRequestsPerCrawl: 10, // Limitation for only 10 requests (do not use if you want to crawl a sitemap)
    });

    // Run the crawler
    await crawler.run();
});
```

<!--END_DOCUSAURUS_CODE_TABS-->

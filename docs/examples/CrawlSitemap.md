---
id: crawl-sitemap
title: Crawl a sitemap
---

This example downloads and crawls the URLs from a sitemap.

<!--DOCUSAURUS_CODE_TABS-->

<!-- BasicCrawler -->

```javascript
const Apify = require("apify");

Apify.main(async () => {
    // Add URLs to a RequestList from a sitemap
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: "SITEMAP_URL_GOES_HERE" }]
    });

    // Initialize the RequestList
    await requestList.initialize();

    // Function called for each URL
    const handleRequestFunction = async ({ request }) => {
        console.log(request.url);
    };

    // Create a BasicCrawler
    const crawler = new Apify.BasicCrawler({
        requestList,
        handleRequestFunction
    });

    // Run the crawler
    await crawler.run();
});
```

<!-- CheerioCrawler -->

```javascript
const Apify = require("apify");

Apify.main(async () => {
    // Add URLs to a RequestList from a sitemap
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: "SITEMAP_URL_GOES_HERE" }]
    });

    // Initialize the RequestList
    await requestList.initialize();

    // Function called for each URL
    const handlePageFunction = async ({ request, $ }) => {
        console.log(request.url);
    };

    // Create a CheerioCrawler
    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction
    });

    // Run the crawler
    await crawler.run();
});
```

<!-- PuppeteerCrawler -->

```javascript
const Apify = require("apify");

Apify.main(async () => {
    // Add URLs to a RequestList from a sitemap
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: "SITEMAP_URL_GOES_HERE" }]
    });

    // Initialize the RequestList
    await requestList.initialize();

    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        console.log(request.url);
    };

    // Create a PuppeteerCrawler
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction
    });

    // Run the crawler
    await crawler.run();
});
```

<!--END_DOCUSAURUS_CODE_TABS-->
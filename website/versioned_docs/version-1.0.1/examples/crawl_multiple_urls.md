---
id: version-1.0.1-crawl-multiple-urls
title: Crawl multiple URLs
original_id: crawl-multiple-urls
---

This example crawls the specified list of URLs.

<!--DOCUSAURUS_CODE_TABS-->

<!-- CheerioCrawler -->

\
Using `CheerioCrawler`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestList
    const requestList = await Apify.openRequestList('start-urls', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handlePageFunction = async ({ request, $ }) => {
        const title = $('title').text();
        console.log(`URL: ${request.url}\nTITLE: ${title}`);
    };
    // Create a CheerioCrawler
    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction,
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
    // Create a RequestList
    const requestList = await Apify.openRequestList('start-urls', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        const title = await page.title();
        console.log(`URL: ${request.url}\nTITLE: ${title}`);
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction,
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
    // Create a RequestList
    const requestList = await Apify.openRequestList('start-urls', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        const title = await page.title();
        console.log(`URL: ${request.url}\nTITLE: ${title}`);
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PlaywrightCrawler({
        requestList,
        handlePageFunction,
    });
    // Run the crawler
    await crawler.run();
});
```

> To run this example on the Apify Platform, select the `apify/actor-node-playwright-chrome` image for your Dockerfile.

<!--END_DOCUSAURUS_CODE_TABS-->

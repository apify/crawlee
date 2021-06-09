---
id: version-0.22.4-crawl-multiple-urls
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
    const requestList = await Apify.openRequestList('my-list', [
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

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestList
    const requestList = await Apify.openRequestList('my-list', [
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

<!-- BasicCrawler -->

\
Using `BasicCrawler`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestList
    const requestList = await Apify.openRequestList('my-list', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handleRequestFunction = async ({ request }) => {
        const { body } = await Apify.utils.requestAsBrowser(request);
        console.log(`URL: ${request.url}\nHTML:\n${body}`);
    };
    // Create a BasicCrawler
    const crawler = new Apify.BasicCrawler({
        requestList,
        handleRequestFunction,
    });
    // Run the crawler
    await crawler.run();
});
```

<!--END_DOCUSAURUS_CODE_TABS-->

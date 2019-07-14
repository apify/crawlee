---
id: crawl-sitemap
title: Crawl a sitemap
---

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

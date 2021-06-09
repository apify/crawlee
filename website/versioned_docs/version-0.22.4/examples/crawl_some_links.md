---
id: version-0.22.4-crawl-some-links
title: Crawl some links on a website
original_id: crawl-some-links
---

This [`CheerioCrawler`](/docs/api/cheerio-crawler) example uses the [`pseudoUrls`](/docs/api/pseudo-url) property in the `Apify.enqueueLinks()` method
to only add links to the `RequestList` queue if they match the specified regular expression.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Create a RequestQueue
    const requestQueue = await Apify.openRequestQueue();
    // Define the starting URL
    await requestQueue.addRequest({ url: 'https://apify.com/store' });
    // Function called for each URL
    const handlePageFunction = async ({ request, $ }) => {
        console.log(request.url);
        // Add some links from page to RequestQueue
        await Apify.utils.enqueueLinks({
            $,
            requestQueue,
            baseUrl: request.loadedUrl,
            pseudoUrls: ['http[s?]://apify.com/[.+]/[.+]'],
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

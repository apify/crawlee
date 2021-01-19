---
id: version-0.22.4-crawl-relative-links
title: Crawl a website with relative links
original_id: crawl-relative-links
---

If a website uses relative links, [`CheerioCrawler`](/docs/api/cheerio-crawler) and `Apify.enqueueLinks()` may have trouble following them. This is
why it is important to set the `baseUrl` property within `Apify.enqueueLinks()` to `request.loadedUrl`:

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
            baseUrl: request.loadedUrl, // <-------------- important to set the base url here
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

---
id: version-2.3.0-basic-crawler
title: Basic crawler
original_id: basic-crawler
---

This is the most bare-bones example of the Apify SDK, which demonstrates some of its building blocks such as the
[`BasicCrawler`](/docs/api/basic-crawler). You probably don't need to go this deep though, and it would be better to start with one of the full
featured crawlers like [`CheerioCrawler`](https://sdk.apify.com/docs/examples/cheerio-crawler) or
[`PlaywrightCrawler`](https://sdk.apify.com/docs/examples/playwright-crawler).

The script simply downloads several web pages with plain HTTP requests using the [`Apify.utils.requestAsBrowser()`](/docs/api/utils#requestasbrowser)
convenience function and stores their raw HTML and URL in the default dataset. In local configuration, the data will be stored as JSON files in
`./apify_storage/datasets/default`.

```javascript
const Apify = require('apify');

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = await Apify.openRequestList('start-urls', [
        { url: 'http://www.google.com/' },
        { url: 'http://www.example.com/' },
        { url: 'http://www.bing.com/' },
        { url: 'http://www.wikipedia.com/' },
    ]);

    // Create a BasicCrawler - the simplest crawler that enables
    // users to implement the crawling logic themselves.
    const crawler = new Apify.BasicCrawler({
        // Let the crawler fetch URLs from our list.
        requestList,

        // This function will be called for each URL to crawl.
        handleRequestFunction: async ({ request }) => {
            const { url } = request;
            console.log(`Processing ${url}...`);

            // Fetch the page HTML via Apify utils requestAsBrowser
            const { body } = await Apify.utils.requestAsBrowser({ url });

            // Store the HTML and URL to the default dataset.
            await Apify.pushData({
                url: request.url,
                html: body,
            });
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

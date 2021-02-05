---
id: version-1.0.1-playwright-crawler
title: Playwright crawler
original_id: playwright-crawler
---

This example demonstrates how to use [`PlaywrightCrawler`](../api/playwright-crawler) in combination with [`RequestQueue`](../api/request-queue) to
recursively scrape the [Hacker News website](https://news.ycombinator.com) using headless Chrome / Playwright.

The crawler starts with a single URL, finds links to next pages, enqueues them and continues until no more desired links are available. The results
are stored to the default dataset. In local configuration, the results are stored as JSON files in `./apify_storage/datasets/default`

> To run this example on the Apify Platform, select the `apify/actor-node-playwright-chrome` image for your Dockerfile.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
    // We add our first request to it - the initial page the crawler will visit.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://news.ycombinator.com/' });

    // Create an instance of the PlaywrightCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Playwright.
    const crawler = new Apify.PlaywrightCrawler({
        requestQueue,
        launchContext: {
            // Here you can set options that are passed to the playwright .launch() function.
            launchOptions: {
                headless: true,
            },
        },

        // Stop crawling after several pages
        maxRequestsPerCrawl: 50,

        // This function will be called for each URL to crawl.
        // Here you can write the Playwright scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with a lot of properties,
        // the most important being:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Playwright's Page object (see https://playwright.dev/docs/api/class-page)
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Playwright within the browser context.
            const data = await page.$$eval('.athing', $posts => {
                const scrapedData = [];

                // We're getting the title, rank and URL of each post on Hacker News.
                $posts.forEach($post => {
                    scrapedData.push({
                        title: $post.querySelector('.title a').innerText,
                        rank: $post.querySelector('.rank').innerText,
                        href: $post.querySelector('.title a').href,
                    });
                });

                return scrapedData;
            });

            // Store the results to the default dataset.
            await Apify.pushData(data);

            // Find a link to the next page and enqueue it if it exists.
            const infos = await Apify.utils.enqueueLinks({
                page,
                requestQueue,
                selector: '.morelink',
            });

            if (infos.length === 0) console.log(`${request.url} is the last page!`);
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times.`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});
```

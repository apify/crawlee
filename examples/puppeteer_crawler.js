/**
 * This example demonstrates how to use [`PuppeteerCrawler`](../api/puppeteercrawler)
 * in combination with [`RequestList`](../api/requestlist)
 * and [`RequestQueue`](../api/requestqueue) to recursively scrape the
 * <a href="https://news.ycombinator.com" target="_blank">Hacker News website</a> using headless Chrome / Puppeteer.
 * The crawler starts with a single URL, finds links to next pages,
 * enqueues them and continues until no more desired links are available.
 * The results are stored to the default dataset. In local configuration, the results are stored as JSON files in `./apify_storage/datasets/default`
 */

const Apify = require('apify');

Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains the start URL.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.ycombinator.com/' },
        ],
    });
    await requestList.initialize();

    // Apify.openRequestQueue() is a factory to get a preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
        // The crawler will first fetch start URLs from the RequestList
        // and then the newly discovered URLs from the RequestQueue
        requestList,
        requestQueue,

        // Run Puppeteer in headless mode. If you set headless to false, you'll see the scraping
        // browsers showing up on your screen. This is great for debugging.
        launchPuppeteerOptions: { headless: true },

        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Puppeteer within the browser context.
            const pageFunction = ($posts) => {
                const data = [];

                // We're getting the title, rank and URL of each post on Hacker News.
                $posts.forEach(($post) => {
                    data.push({
                        title: $post.querySelector('.title a').innerText,
                        rank: $post.querySelector('.rank').innerText,
                        href: $post.querySelector('.title a').href,
                    });
                });

                return data;
            };
            const data = await page.$$eval('.athing', pageFunction);

            // Store the results to the default dataset.
            await Apify.pushData(data);

            // Find the link to the next page using Puppeteer functions.
            let nextHref;
            try {
                nextHref = await page.$eval('.morelink', el => el.href);
            } catch (err) {
                console.log(`${request.url} is the last page!`);
                return;
            }

            // Enqueue the link to the RequestQueue
            await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed too many times`);
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
});

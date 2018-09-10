/**
 * This example demonstrates how to use PuppeteerCrawler in connection with the RequestQueue to recursively scrape
 * the Hacker News site (https://news.ycombinator.com). It starts with a single URL where it finds more links,
 * enqueues them to the RequestQueue and continues until no more desired links are available.
 *
 * Example uses:
 * - Apify PuppeteerCrawler to scrape pages using Puppeteer in parallel.
 * - Apify Dataset to store data.
 * - Apify RequestQueue to manage dynamic queue of pending and handled requests.
 * - Puppeteer to control headless Chrome browser.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Apify.openRequestQueue() is a factory to get preconfigured RequestQueue instance.
    const requestQueue = await Apify.openRequestQueue();

    // Enqueue only the first URL.
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create a PuppeteerCrawler. It's configuration is similar to the CheerioCrawler,
    // only instead of the parsed HTML, handlePageFunction gets an instance of the
    // Puppeteer.Page class. See Puppeteer docs for more information.
    const crawler = new Apify.PuppeteerCrawler({
        // Use of requestQueue is similar to RequestList.
        requestQueue,

        // Run Puppeteer headless. If you turn this off, you'll see the scraping
        // browsers showing up on screen. Non-headless mode is great for debugging.
        launchPuppeteerOptions: { headless: true },

        // For each Request in the queue, a new Page is opened in a browser.
        // This is the place to write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are managed for you by Apify SDK automatically.
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);

            // A function to be evaluated by Puppeteer within
            // the browser context.
            const pageFunction = ($posts) => {
                const data = [];

                // We're getting the title, rank and url of each post on Hacker News.
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

            // Save data to default Dataset.
            await Apify.pushData(data);

            // To continue crawling, we need to enqueue some more pages into
            // the requestQueue. First we find the correct URLs using Puppeteer
            // and then we add the request to the queue.
            try {
                const nextHref = await page.$eval('.morelink', el => el.href);
                // You may omit the Request constructor and just use a plain object.
                await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
            } catch (err) {
                console.log(`Url ${request.url} is the last page!`);
            }
        },

        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`); // Because 3 retries is the default value.
        },
    });

    // Run crawler.
    await crawler.run();
    console.log('Crawler finished.');
});

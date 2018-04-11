/**
 * This is example how to scrape Hacker News site (https://news.ycombinator.com) using Apify SDK and Puppeteer.
 *
 * Example uses:
 * - PuppeteerCrawler to scrape pages using Puppeteer in parallel
 * - Dataset to store data
 * - Request Queue to manage dynamic queue of pending and handled requests
 */

const Apify = require('apify');

Apify.main(async () => {
    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();

    // Enqueue Start url.
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,
        disableProxy: true,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({ page, request }) => {
            console.log(`Request ${request.url} succeeded!`);

            // Extract all posts.
            const pageFunction = ($posts) => {
                const extractFromPost = ($post) => {
                    return {
                        title: $post.querySelector('.title a').innerText,
                        rank: $post.querySelector('.rank').innerText,
                        href: $post.querySelector('.title a').href,
                    };
                };

                return $posts.map(extractFromPost);
            };
            const data = await page.$$eval('.athing', pageFunction);

            // Save data.
            await Apify.pushData({
                url: request.url,
                data,
            });

            // Enqueue next page.
            try {
                const nextHref = await page.$eval('.morelink', el => el.href);
                await requestQueue.addRequest(new Apify.Request({ url: nextHref }));
            } catch (err) {
                console.log(`Url ${request.url} is the last page!`);
            }
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);

            await Apify.pushData({
                url: request.url,
                errors: request.errorMessages,
            });
        },
    });

    // Run crawler.
    await crawler.run();
});

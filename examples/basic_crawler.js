/**
 * This is the most basic example of the Apify SDK, which demonstrates some of its
 * elementary tools, such as the
 * [`BasicCrawler`](/docs/api/basic-crawler)
 * and [`RequestList`](/docs/api/request-list) classes.
 * The script just downloads several web pages with plain HTTP requests using the
 * [`Apify.utils.requestAsBrowser()`](/docs/api/utils#requestasbrowser)
 * convenience function and stores their raw HTML and URL to the default dataset.
 * In local configuration, the data will be stored as JSON files in `./apify_storage/datasets/default`.
 *
 * To run this example on the Apify Platform, select the `Node.js 12 on Alpine Linux (apify/actor-node-basic)` base image
 * on the source tab of your actor configuration.
 */

const Apify = require('apify');

// Apify.main() function wraps the crawler logic (it is optional).
Apify.main(async () => {
    // Create and initialize an instance of the RequestList class that contains
    // a list of URLs to crawl. Here we use just a few hard-coded URLs.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.google.com/' },
            { url: 'http://www.example.com/' },
            { url: 'http://www.bing.com/' },
            { url: 'http://www.wikipedia.com/' },
        ],
    });
    await requestList.initialize();

    // Create a BasicCrawler - the simplest crawler that enables
    // users to implement the crawling logic themselves.
    const crawler = new Apify.BasicCrawler({

        // Let the crawler fetch URLs from our list.
        requestList,

        // This function will be called for each URL to crawl.
        // The 'request' option is an instance of the Request class, which contains
        // information such as URL and HTTP method, as supplied by the RequestList.
        handleRequestFunction: async ({ request }) => {
            console.log(`Processing ${request.url}...`);

            // Fetch the page HTML
            const { body } = await Apify.utils.requestAsBrowser(request);

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

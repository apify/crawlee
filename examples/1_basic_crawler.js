/**
 * This is the most basic example of using the Apify SDK. Start with it. It explains some
 * essential concepts that are used throughout the SDK.
 *
 * Example uses:
 * - Apify BasicCrawler to manage requests and autoscale the scraping job.
 * - Apify Dataset to store data.
 * - Apify RequestList to save a list of target URLs.
 */
// We require the Apify SDK and a popular client to make HTTP requests.
const Apify = require('apify');
const requestPromise = require('request-promise');

// The Apify.main() function wraps the crawler logic and is a mandatory
// part of every crawler run using Apify SDK.
Apify.main(async () => {
    // Prepare a list of URLs to crawl. For that we use an instance of the RequestList class.
    // Here we just throw some URLs into an array of sources, but the RequestList can do much more.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'https://www.google.com/' },
            { url: 'https://www.example.com/' },
            { url: 'https://www.bing.com/' },
            { url: 'https://www.wikipedia.org/' },
        ],
    });

    // Since initialization of the RequestList is asynchronous, you must always
    // call .initialize() before using it.
    await requestList.initialize();

    // To crawl the URLs, we use an instance of the BasicCrawler class which is our simplest,
    // but still powerful crawler. Its constructor takes an options object where you can
    // configure it to your liking. Here, we're keeping things simple.
    const crawler = new Apify.BasicCrawler({

        // We use the request list created earlier to feed URLs to the crawler.
        requestList,

        // We define a handleRequestFunction that describes the actions
        // we wish to perform for each URL.
        handleRequestFunction: async ({ request }) => {
            // 'request' contains an instance of the Request class which is a container
            // for request related data such as URL or Method (GET, POST ...) and is supplied by the requestList we defined.
            console.log(`Processing ${request.url}...`);

            // Here we simply fetch the HTML of the page and store it to the default Dataset.
            await Apify.pushData({
                url: request.url,
                html: await requestPromise(request.url),
            });
        },
    });

    // Once started the crawler, will automatically work through all the pages in the requestList
    // and the created promise will resolve once the crawl is completed. The collected HTML will be
    // saved in the ./apify_storage/datasets/default folder, unless configured differently.
    await crawler.run();
    console.log('Crawler finished.');
});

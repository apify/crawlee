/**
 * This example shows how to extract data (the content of title and all h1 tags) from an external
 * list of URLs (parsed from a CSV file) using CheerioCrawler.
 *
 * It builds upon the previous BasicCrawler example, so if you missed that one, you should check it out.
 *
 * Example uses:
 * - Apify CheerioCrawler to scrape pages using the cheerio NPM package.
 * - Apify Dataset to store data.
 * - Apify RequestList to download a list of URLs from a remote resource.
 */
const Apify = require('apify');

// Utils is a namespace with nice to have things, such as logging control.
const { log } = Apify.utils;
// This is how you can turn internal logging off.
log.setLevel(log.LEVELS.OFF);

// This is just a list of Fortune 500 companies' websites available on GitHub.
const CSV_LINK = 'https://gist.githubusercontent.com/hrbrmstr/ae574201af3de035c684/raw/2d21bb4132b77b38f2992dfaab99649397f238e9/f1000.csv';

Apify.main(async () => {
    // Using the 'requestsFromUrl' parameter instead of 'url' tells the RequestList to download
    // the document available at the given URL and parse URLs out of it.
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: CSV_LINK }],
    });
    await requestList.initialize();

    // We're using the CheerioCrawler here. Its core difference from the BasicCrawler is the fact
    // that the HTTP request is already handled for you and you get a parsed HTML of the
    // page in the form of the cheerio object - $.
    const crawler = new Apify.CheerioCrawler({
        requestList,

        // We define some boundaries for concurrency. It will be automatically managed.
        // Here we say that no less than 5 and no more than 50 parallel requests should
        // be run. The actual concurrency amount is based on memory and CPU load and is
        // managed by the AutoscaledPool class.
        minConcurrency: 10,
        maxConcurrency: 50,

        // We can also set the amount of retries.
        maxRequestRetries: 1,

        // Or the timeout for each page in seconds.
        handlePageTimeoutSecs: 3,

        // In addition to the BasicCrawler, which only provides access to the request parameter,
        // CheerioCrawler further exposes the '$' parameter, which is the cheerio object containing
        // the parsed page, and the 'html' parameter, which is just the raw HTML.
        // Also, since we're not making the request ourselves, the function is named differently.
        handlePageFunction: async ({ $, html, request }) => {
            console.log(`Processing ${request.url}...`);

            // Extract data with cheerio.
            const title = $('title').text();
            const h1texts = [];
            $('h1').each((index, el) => {
                h1texts.push({
                    text: $(el).text(),
                });
            });

            // Save data to default Dataset.
            await Apify.pushData({
                url: request.url,
                title,
                h1texts,
                html,
            });
        },

        // If request failed 1 + maxRequestRetries then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();
    console.log('Crawler finished.');
});

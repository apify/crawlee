import { Dataset, HttpCrawler, log, LogLevel } from 'crawlee';

// Crawlers come with various utilities, e.g. for logging.
// Here we use debug level of logging to improve the debugging experience.
// This functionality is optional!
log.setLevel(LogLevel.DEBUG);

// Create an instance of the HttpCrawler class - a crawler
// that automatically loads the URLs and saves their HTML.
const crawler = new HttpCrawler({
    // The crawler downloads and processes the web pages in parallel, with a concurrency
    // automatically managed based on the available system memory and CPU (see AutoscaledPool class).
    // Here we define some hard limits for the concurrency.
    minConcurrency: 10,
    maxConcurrency: 50,

    // On error, retry each page at most once.
    maxRequestRetries: 1,

    // Increase the timeout for processing of each page.
    requestHandlerTimeoutSecs: 30,

    // Limit to 10 requests per one crawl
    maxRequestsPerCrawl: 10,

    // This function will be called for each URL to crawl.
    // It accepts a single parameter, which is an object with options as:
    // https://crawlee.dev/api/http-crawler/interface/HttpCrawlerOptions#requestHandler
    // We use for demonstration only 2 of them:
    // - request: an instance of the Request class with information such as the URL that is being crawled and HTTP method
    // - body: the HTML code of the current page
    async requestHandler({ request, body }) {
        log.debug(`Processing ${request.url}...`);

        // Store the results to the dataset. In local configuration,
        // the data will be stored as JSON files in ./storage/datasets/default
        await Dataset.pushData({
            url: request.url,
            body,
        });
    },

    // This function is called if the page processing failed more than maxRequestRetries + 1 times.
    failedRequestHandler({ request }) {
        log.debug(`Request ${request.url} failed twice.`);
    },
});

// Run the crawler and wait for it to finish.
await crawler.run([
    'https://crawlee.dev',
]);

log.debug('Crawler finished.');

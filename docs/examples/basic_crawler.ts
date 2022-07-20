import { BasicCrawler, Dataset } from 'crawlee';

// Create a BasicCrawler - the simplest crawler that enables
// users to implement the crawling logic themselves.
const crawler = new BasicCrawler({
    // This function will be called for each URL to crawl.
    async requestHandler({ request, sendRequest, log }) {
        const { url } = request;
        log.info(`Processing ${url}...`);

        // Fetch the page HTML via the crawlee sendRequest utility method
        // By default, the method will use the current request that is being handled, so you don't have to
        // provide it yourself. You can also provide a custom request if you want.
        const { body } = await sendRequest();

        // Store the HTML and URL to the default dataset.
        await Dataset.pushData({
            url,
            html: body,
        });
    },
});

// The initial list of URLs to crawl. Here we use just a few hard-coded URLs.
await crawler.addRequests([
    'https://www.google.com',
    'https://www.example.com',
    'https://www.bing.com',
    'https://www.wikipedia.com',
]);

// Run the crawler and wait for it to finish.
await crawler.run();

console.log('Crawler finished.');

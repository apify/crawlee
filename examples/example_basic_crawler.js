const Apify = require('../build');
const rp = require('request-promise');

Apify.main(async () => {
    // Create a request list.
    const requestList = new Apify.RequestList({
        sources: [
            { url: 'http://www.example.com' },
            { url: 'http://www.example.com/page-2' },
            { url: 'http://www.example.com/page-3' },
            { url: 'http://www.example.com/page-4' },
            { url: 'http://www.example.com/page-5' },
        ],
    });

    await requestList.initialize();

    const crawler = new Apify.BasicCrawler({
        requestList,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        handleRequestFunction: async ({ request }) => {
            const pageHtml = await rp(request.url);

            console.log(`Request ${request.url} succeeded with return html of length ${pageHtml.length}`);
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler for request list.
    await crawler.run();
});

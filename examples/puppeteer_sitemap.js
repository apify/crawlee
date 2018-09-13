/**
 * This example demonstrates how to use `PuppeteerCrawler` to crawl a list of web pages
 * specified in a sitemap. The crawler extract page title and URL from each pages
 * and stores it as a record to the default dataset.
 * In local configuration, the results are stored as JSON files in `./apify_storage/datasets/default`
 */

const Apify = require('apify');

Apify.main(async () => {
    const requestList = new Apify.RequestList({
        sources: [{ requestsFromUrl: 'https://edition.cnn.com/sitemaps/cnn/news.xml' }],
    });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);
            await Apify.pushData({
                url: request.url,
                title: await page.title(),
                html: await page.content(),
            });
        },
    });

    await crawler.run();
    console.log('Done.');
});

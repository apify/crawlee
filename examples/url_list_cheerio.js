/**
 * This example shows how to extract data (title and "see also" links) form a list of Wikipedia articles
 * using Cheerio and Request NPM packages.
 *
 * Example uses:
 * - Apify BasicCrawler to scrape pages using Puppeteer in parallel
 * - Apify Dataset to store data
 * - Apify RequestList to manage a list of urls to be processed
 * - Request NPM package to request html content of website
 * - Cherio NPM package to parse html and extract data
 */

const Apify = require('apify');
const rp = require('request-promise');
const cheerio = require('cheerio');

Apify.main(async () => {
    const sources = [
        { url: 'https://en.wikipedia.org/wiki/Amazon_Web_Services' },
        { url: 'https://en.wikipedia.org/wiki/Google_Cloud_Platform' },
        { url: 'https://en.wikipedia.org/wiki/Microsoft_Azure' },
        { url: 'https://en.wikipedia.org/wiki/Rackspace_Cloud' },
    ];

    // Create a request list.
    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    const crawler = new Apify.BasicCrawler({
        requestList,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        handleRequestFunction: async ({ request }) => {
            console.log(`Processing ${request.url}...`);

            // Request html of page.
            const html = await rp(request.url);

            // Extract data with cheerio.
            const $ = cheerio.load(html);
            const $seeAlsoElement = $('#See_also').parent().next();
            const seeAlsoLinks = [];
            $seeAlsoElement.find('a').each((index, el) => {
                seeAlsoLinks.push({
                    url: $(el).attr('href'),
                    text: $(el).text(),
                });
            });

            // Save data.
            await Apify.pushData({
                url: request.url,
                title: $('h1').text(),
                seeAlsoLinks,
            });
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler for request list.
    await crawler.run();
});

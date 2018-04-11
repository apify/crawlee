/**
 * This example shows how to extract data (title and "see also" links) form a list of Wikipedia articles using Puppeteer.
 *
 * Example uses:
 * - Apify BasicCrawler to scrape pages in parallel
 * - Apify Dataset to store data
 * - Apify RequestList to manage a list of urls to be processed
 * - Puppeter to controll headless Chrome browser
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

    const crawler = new Apify.PuppeteerCrawler({
        requestList,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({ request, page }) => {
            console.log(`Processing ${request.url}...`);

            // Extract data with Puppeteer.
            const seeAlsoLinks = await page.$eval('#See_also', (seeAlsoTitleEl) => {
                const seeAlsoListEl = seeAlsoTitleEl.parentNode.nextSibling.nextSibling;
                const seeAlsoLinksEls = seeAlsoListEl.querySelectorAll('a');
                const data = [];

                seeAlsoLinksEls.forEach((linkEl) => {
                    data.push({
                        title: linkEl.innerText,
                        url: linkEl.getAttribute('href'),
                    });
                });

                return data;
            });

            // Save data.
            await Apify.pushData({
                url: request.url,
                title: await page.$eval('h1', el => el.innerText),
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

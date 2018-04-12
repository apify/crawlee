/**
 * This is example how to scrape Hacker News site (https://news.ycombinator.com) using Apify SDK
 * with Cheerio and Request NPM packages.
 *
 * Example uses:
 * - Apify BasicCrawler to scrape pages in parallel
 * - Apify Dataset to store data
 * - Apify RequestQueue to manage dynamic queue of pending and handled requests
 * - Request NPM package to request html content of website
 * - Cherio NPM package to parse html and extract data
 */

const Apify = require('apify');
const rp = require('request-promise');
const cheerio = require('cheerio');

Apify.main(async () => {
    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();

    // Enqueue Start url.
    await requestQueue.addRequest(new Apify.Request({ url: 'https://news.ycombinator.com/' }));

    // Create crawler.
    const crawler = new Apify.BasicCrawler({
        requestQueue,
        disableProxy: true,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        handleRequestFunction: async ({ request }) => {
            console.log(`Processing ${request.url}...`);

            // Request html of page.
            const html = await rp(request.url);

            // Extract data with cheerio.
            const data = [];
            const $ = cheerio.load(html);
            $('.athing').each((index, el) => {
                data.push({
                    title: $(el).find('.title a').text(),
                    rank: $(el).find('.rank').text(),
                    href: $(el).find('.title a').attr('href'),
                });
            });

            // Save data.
            await Apify.pushData(data);

            // Enqueue next page.
            const $moreLink = $('.morelink');
            if ($moreLink.length) {
                const path = $moreLink.attr('href')
                const url = `https://news.ycombinator.com/${path}`;

                await requestQueue.addRequest(new Apify.Request({ url }));
            } else {
                console.log(`Url ${request.url} is the last page!`);
            }
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
});

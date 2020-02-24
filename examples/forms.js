/**
 * This example demonstrates how to use
 * [`PuppeteerCrawler`](/docs/api/puppeteer-crawler)
 * to automatically fill and submit a search form to look up repositories on
 * [GitHub](https://news.ycombinator.com)
 * using headless Chrome / Puppeteer.
 * The actor first fills in the search term, repository owner, start date and
 * language of the repository, then submits the form and prints out the results.
 * Finally, the results are saved either on the Apify platform to the default
 * [`Dataset`](/docs/api/dataset)
 * or on the local machine as JSON files in `./apify_storage/datasets/default`.
 *
 * To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image
 * on the source tab of your actor configuration.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer();

    // Create and navigate new page
    console.log('Open target page');
    const page = await browser.newPage();
    await page.goto('https://github.com/search/advanced');

    // Fill form fields and select desired search options
    console.log('Fill in search form');
    await page.type('#adv_code_search input.js-advanced-search-input', 'apify-js');
    await page.type('#search_from', 'apifytech');
    await page.type('#search_date', '>2015');
    await page.select('select#search_language', 'JavaScript');

    // Submit the form and wait for full load of next page
    console.log('Submit search form');
    await Promise.all([
        page.waitForNavigation(),
        page.click('#adv_code_search button[type="submit"]')
    ]);

    // Obtain and print list of search results
    const results = await page.$$eval('div.codesearch-results ul.repo-list li h3 a', nodes => nodes.map(node => ({
        url: node.href,
        name: node.innerText
    })));
    console.log('Results:', results);

    // Store data in default dataset
    await Apify.pushData(results);
});

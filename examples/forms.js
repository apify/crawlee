/**
 * This example demonstrates how to use
 * [`PuppeteerCrawler`](../api/puppeteercrawler)
 * to automatically fill and submit a search form to look up repositories on
 * <a href="https://news.ycombinator.com" target="_blank">GitHub</a>
 * using headless Chrome / Puppeteer.
 * The actor first fills in the search term, repository owner, start date and
 * language of the repository, then submits the form and prints out the results.
 *
 * To run this example on the Apify Platform, select the `Node.js 8 + Chrome on Debian (apify/actor-node-chrome)` base image
 * on the source tab of your actor configuration.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Launch the web browser.
    const browser = await Apify.launchPuppeteer();

    // Create and navigate new page
    const page = await browser.newPage();
    await page.goto('https://github.com/search/advanced');

    console.log('Fill in search form');
    await page.type('#adv_code_search input.js-advanced-search-input', 'apify-js');
    await page.type('#search_from', 'apifytech');
    await page.type('#search_date', '>2015');
    await page.select('select#search_language', 'JavaScript');

    console.log('Submit search form');
    await Promise.all([
        page.waitForNavigation(),
        page.click('#adv_code_search button[type="submit"]')
    ]);

    // Obtain and print list of search results
    const results = await page.$$eval('div.codesearch-results > div h3 a', nodes => nodes.map(node => node.innerText));
    console.log('Results:', results);
});

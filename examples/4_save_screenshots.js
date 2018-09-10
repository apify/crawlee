/**
 * This example shows how to work with KeyValueStore. It crawls a list of URLs using Puppeteer,
 * capture a screenshot of each page and saves it to the KeyValueStore. The list of URLs is
 * provided as INPUT, which is a standard way of passing initial configuration to Apify actors.
 * Locally, INPUT needs to be placed in the KeyValueStore. On the platform, it can either be set
 * using the applications UI or passed as the body of the Run Actor API call.
 *
 * For more information on RequestList, see example 1. For PuppeteerCrawler, see example 3.
 *
 * Example uses:
 * - Apify PuppeteerCrawler to scrape pages using Puppeteer in parallel.
 * - Apify KeyValueStore to read INPUT and store screenshots.
 * - Apify RequestList to save a list of target URLs.
 * - Puppeteer to control headless Chrome browser.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Apify.getValue() is a shorthand to read the value of the provided key (INPUT) from the default KeyValueStore.
    // To read the INPUT on your local machine, you first need to create it.
    // Place an INPUT.json file with the desired input into the
    // ./apify_storage/key_value_stores/default directory (unless configured otherwise).
    // Example input: { "sources": [{ "url": "https://www.google.com" },  { "url": "https://www.duckduckgo.com" }] }
    const { sources } = await Apify.getValue('INPUT');

    const requestList = new Apify.RequestList({ sources });
    await requestList.initialize();

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        launchPuppeteerOptions: { headless: true },
        handlePageFunction: async ({ page, request }) => {
            console.log(`Processing ${request.url}...`);

            // This is a Puppeteer function that takes a screenshot of the Page and returns its buffer.
            const screenshotBuffer = await page.screenshot();

            // uniqueKey is a normalized URL of the request,
            // but KeyValueStore keys may only include [a-zA-Z0-9!-_.'()] characters.
            const key = request.uniqueKey.replace(/[:/]/g, '_');

            // Here we save the screenshot. Choosing the right content type will automatically
            // assign the local file the right extension. In this case: .png
            await Apify.setValue(key, screenshotBuffer, { contentType: 'image/png' });
            console.log('Screenshot saved.');
        },
    });

    // Run crawler.
    await crawler.run();
    console.log('Crawler finished.');
});

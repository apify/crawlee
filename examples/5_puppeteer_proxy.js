/**
 * This example demonstrates the use of Apify features with Puppeteer.
 * We'll show you how to use Apify Proxy without using our Crawlers
 * and instead using only Puppeteer itself.
 *
 * Example uses:
 * - Apify.launchPuppeteer() function to get a supercharged instance of Puppeteer.
 * - Puppeteer to control headless Chrome browser.
 * - Apify Dataset to store data.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Apify enhances not only our Crawlers, but also plain Puppeteer
    // with useful tools such as automatic proxy use (from our own pool).
    // To use the Proxy, you need to either log in using the Apify CLI, or set
    // the APIFY_PROXY_PASSWORD environment variable. You will find the password
    // under your account in the Apify Platform.
    // Other options such as LiveView may also be enabled for Puppeteer.
    const options = {
        useApifyProxy: true,
        headless: true,
    };

    // Apify.launchPuppeteer() is a shortcut to get a preconfigured Puppeteer.Browser
    // instance with extra features provided by Apify. All original Puppeteer options
    // are passed directly to Puppeteer.
    const browser = await Apify.launchPuppeteer(options);

    console.log('Running Puppeteer...');
    // Proceed with a plain Puppeteer script.
    const page = await browser.newPage();
    const url = 'https://en.wikipedia.org/wiki/Main_Page';
    await page.goto(url);
    const html = await page.content();

    // Use any Apify feature.
    await Apify.pushData({ url, html });

    // Cleaning up resources is a good practice.
    await browser.close();
    console.log('Puppeteer closed.');
});

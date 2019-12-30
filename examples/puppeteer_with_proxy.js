/**
 * This example demonstrates how to load pages in headless Chrome / Puppeteer
 * over <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
 * To make it work, you'll need an Apify Account
 * that has access to the proxy.
 * The proxy password is available on the <a href="https://my.apify.com/proxy" target="_blank">Proxy</a> page in the app.
 * Just set it to the `APIFY_PROXY_PASSWORD` [environment variable](../guides/environmentvariables)
 * or run the script using the CLI.
 *
 * To run this example on the Apify Platform, select the `Node.js 10 + Chrome on Debian (apify/actor-node-chrome)` base image
 * on the source tab of your actor configuration.
 */

const Apify = require('apify');

Apify.main(async () => {
    // Apify.launchPuppeteer() is similar to Puppeteer's launch() function.
    // It accepts the same parameters and returns a preconfigured Puppeteer.Browser instance.
    // Moreover, it accepts several additional options, such as useApifyProxy.
    const options = {
        useApifyProxy: true,
    };
    const browser = await Apify.launchPuppeteer(options);

    console.log('Running Puppeteer script...');

    // Proceed with a plain Puppeteer script.
    const page = await browser.newPage();
    const url = 'https://en.wikipedia.org/wiki/Main_Page';
    await page.goto(url);
    const title = await page.title();

    console.log(`Page title: ${title}`);

    // Cleaning up after yourself is always good.
    await browser.close();
    console.log('Puppeteer closed.');
});

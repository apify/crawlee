---
id: puppeteerwithproxy
title: Puppeteer With Proxy
---

This example demonstrates how to load pages in headless Chrome / Puppeteer
over [Apify Proxy](https://www.apify.com/docs/proxy).
To make it work, you'll need an Apify Account
that has access to the proxy.
The proxy password is available on the [Proxy](https://my.apify.com/proxy) page in the app.
Just set it to the `APIFY_PROXY_PASSWORD` environment variable
or run the script using the CLI.
```javascript
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
```
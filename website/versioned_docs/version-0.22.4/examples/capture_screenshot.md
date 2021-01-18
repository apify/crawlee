---
id: version-0.22.4-capture-screenshot
title: Capture a screenshot
original_id: capture-screenshot
---

> To run this example on the Apify Platform, select the `Node.js 12 + Chrome on Debian (apify/actor-node-chrome)` base image on the **Source** tab
> when configuring the actor.

This example captures of a screenshot of a web page using `Puppeteer`:

<!--DOCUSAURUS_CODE_TABS-->

<!-- PageScreenshot -->

\
Using `page.screenshot()`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const url = 'http://www.example.com/';
    // Start a browser
    const browser = await Apify.launchPuppeteer();
    // Open new tab in the browser
    const page = await browser.newPage();
    // Navigate to the URL
    await page.goto(url);
    // Capture the screenshot
    const screenshot = await page.screenshot();
    // Save the screenshot to the default key-value store
    await Apify.setValue('my-key', screenshot, { contentType: 'image/png' });
    // Close Puppeteer
    await browser.close();
});
```

<!-- ApifySnapshot -->

\
Using `Apify.utils.puppeteer.saveSnapshot()`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const url = 'http://www.example.com/';
    // Start a browser
    const browser = await Apify.launchPuppeteer();
    // Open new tab in the browser
    const page = await browser.newPage();
    // Navigate to the URL
    await page.goto(url);
    // Capture the screenshot
    await Apify.utils.puppeteer.saveSnapshot(page, { key: 'my-key', saveHtml: false });
    // Close Puppeteer
    await browser.close();
});
```

<!--END_DOCUSAURUS_CODE_TABS-->

This example captures a screenshot of multiple web pages when using `PuppeteerCrawler`:

<!--DOCUSAURUS_CODE_TABS-->

<!-- PageScreenshot -->

\
Using `page.screenshot()`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Add URLs to a RequestList
    const requestList = await Apify.openRequestList('my-list', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        // Capture the screenshot with Puppeteer
        const screenshot = await page.screenshot();
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Save the screenshot to the default key-value store
        await Apify.setValue(key, screenshot, { contentType: 'image/png' });
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction,
    });
    // Run the crawler
    await crawler.run();
});
```

<!-- ApifySnapshot -->

\
Using `Apify.utils.puppeteer.saveSnapshot()`:

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Add URLs to a RequestList
    const requestList = await Apify.openRequestList('my-list', [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' },
    ]);
    // Function called for each URL
    const handlePageFunction = async ({ request, page }) => {
        // Convert the URL into a valid key
        const key = request.url.replace(/[:/]/g, '_');
        // Capture the screenshot
        await Apify.utils.puppeteer.saveSnapshot(page, { key, saveHtml: false });
    };
    // Create a PuppeteerCrawler
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        handlePageFunction,
    });
    // Run the crawler
    await crawler.run();
});
```

<!--END_DOCUSAURUS_CODE_TABS-->

In both examples using `page.screenshot()`, a `key` variable is created based on the URL of the web page. This variable is used as the key when saving
each screenshot into a key-value store.

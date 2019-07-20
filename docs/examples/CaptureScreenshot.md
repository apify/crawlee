---
id: capture-screenshot
title: Capture a screenshot
---

This example captures of a screenshot of a web page using Puppeteer:

```javascript
const Apify = require("apify");

Apify.main(async () => {
    const url = "http://www.example.com";

    // Launch Puppeteer
    const browser = await Apify.launchPuppeteer();

    // Open a new page
    const page = await browser.newPage();

    // Navigate to the URL
    await page.goto(url);

    // Capture the screenshot
    const screenshot = await page.screenshot();

    // Convert the URL into a valid key
    const key = request.url.replace(/[:/]/g, "_");

    // Save the screenshot to the default key-value store
    await Apify.setValue(key, screenshot, { contentType: "image/png" });

    // Close Puppeteer
    await browser.close();
});
```

This example captures a screenshot of multiple web pages when using `PuppeteerCrawler`:

```javascript
const Apify = require("apify");

Apify.main(async () => {

  // Add URLs to a RequestList
  const requestList = new Apify.RequestList({
    sources: [
        { url: 'http://www.example.com/page-1' },
        { url: 'http://www.example.com/page-2' },
        { url: 'http://www.example.com/page-3' }
      ]
  });

  // Initiliaze the RequestList
  await requestList.initialize();

  // Function called for each URL
  const handlePageFunction = async ({ request, page }) => {

    // Capture the screenshot with Puppeteer
    const screenshot = await page.screenshot();

    // Convert the URL into a valid key
    const key = request.url.replace(/[:/]/g, '_');

    // Save the screenshot to the default key-value store
    await Apify.setValue(key, screenshot, { contentType: 'image/png' });

  });

  // Create a PuppeteerCrawler
  const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction
  });

  // Run the crawler
  await crawler.run();

});
```

In both examples, a `key` variable is created based on the URL of the web page. This variable is used as the key when saving each screenshot into a key-value store.

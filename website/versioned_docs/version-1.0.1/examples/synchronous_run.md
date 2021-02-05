---
id: version-1.0.1-synchronous-run
title: Synchronous run
original_id: synchronous-run
---

This example shows a quick actor that has a run time of just a few seconds. It opens a [web page](https://en.wikipedia.org) (the Wikipedia home page),
which contains a list of "Did you know" texts that change daily. The actor scrapes all the "Did you know" items and saves them to the default dataset.

This actor can be invoked synchronously using a single HTTP request to directly obtain its output as a response, using the
[Run actor synchronously](https://apify.com/docs/api/v2#/reference/actors/run-actor-synchronously/without-input) Apify API endpoint.

> To run this example on the Apify Platform, select the `apify/actor-node-puppeteer-chrome` image for your Dockerfile.

```javascript
const Apify = require('apify');

Apify.main(async () => {
    // Launch web browser.
    const browser = await Apify.launchPuppeteer({ launchOptions: { headless: true } });
    // Load https://en.wikipedia.org and get all "Did you know" texts.
    console.log('Opening web page...');
    const page = await browser.newPage();
    await page.goto('https://en.wikipedia.org');

    // Get all "Did you know" items from the page.
    console.log('Getting "Did you know" items from the page.');
    const results = await page.$$eval('div#mp-dyk > ul li', nodes => nodes.map(node => node.innerText.replace('...', 'Did you know')));
    console.log(results);

    // Save all the items to the Apify dataSet.
    await Apify.pushData(results);
    console.log('Actor finished.');

    // Close browser
    await browser.close();
});
```

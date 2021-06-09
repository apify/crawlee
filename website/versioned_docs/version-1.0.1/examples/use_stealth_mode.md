---
id: version-1.0.1-use-stealth-mode
title: Use stealth mode
original_id: use-stealth-mode
---

Stealth mode allows you to bypass anti-scraping techniques which use
[browser fingerprinting](https://pixelprivacy.com/resources/browser-fingerprinting/). It overrides the attributes specified for
[headless](https://developers.google.com/web/updates/2017/04/headless-chrome) browser mode, making your headless browser harder to distinguish from
the full Chrome browser.

To activate stealth mode, you need to `useChrome`, run `headless` and turn `stealth` on in your
[`launchContext`](https://sdk.apify.com/docs/typedefs/puppeteer-crawler-options#launchcontext).

```js
const launchContext = {
    useChrome: true,
    stealth: true,
    launchOptions: {
        headless: true,
    },
};
```

```javascript
const Apify = require('apify');

Apify.main(async () => {
    const requestList = await Apify.openRequestList('start-urls', ['https://news.ycombinator.com/']);

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        launchContext: {
            useChrome: true,
            stealth: true,
            launchOptions: {
                headless: true,
            },
            // You can override default stealth options
            // stealthOptions: {
            //     addLanguage: false,
            // },
        },
        handlePageFunction: async ({ page }) => {
            const data = await page.$$eval('.athing', $posts => {
                const scrapedData = [];
                // Get the title of each post on Hacker News
                $posts.forEach($post => {
                    const title = $post.querySelector('.title a').innerText;
                    scrapedData.push({
                        title: `The title is: ${title}`,
                    });
                });
                return scrapedData;
            });
            // Save the data array to the Apify dataSet
            await Apify.pushData(data);
        },
    });
    await crawler.run();
});
```

You can then specify the [`stealthOptions`](https://sdk.apify.com/docs/typedefs/stealth-options), which allow you to adapt to different anti-scraping
techniques. All the options are set to `true` by default. The number of options does not affect performance.

While the default configuration will be fine in many cases, you can adapt the options to your use case.

### Single-browser instances

You can also use stealth mode in single-browser instances when using [`Apify.launchPuppeteer`](https://sdk.apify.com/docs/api/apify#launchpuppeteer).
The `launchContext` is the same.

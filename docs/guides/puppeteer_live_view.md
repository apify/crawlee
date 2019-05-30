---
id: puppeteerliveview
title: Puppeteer Live View
---

Apify SDK enables real-time view of launched Puppeteer browser instances and their open tabs,
including screenshots of pages and snapshots of HTML.
This is useful for debugging your crawlers that run in headless mode.

The live view dashboard is run on a web server that is started on a port specified
by the `APIFY_CONTAINER_PORT` environment variable (typically 4321).
To enable live view, pass the `useliveView: true` option to
the `puppeteerPoolOptions` of [`PuppeteerCrawler`](../api/puppeteercrawler#new_PuppeteerCrawler_new):

```js
const crawler = new Apify.PuppeteerCrawler({
    puppeteerPoolOptions: {
        useLiveView: true,
    }
    // other options
});
```

or directly to the [`PuppeteerPool`](../api/puppeteerpool) constructor, when using it standalone:

```js
const pool = new Apify.PuppeteerPool({
    useLiveView: true,
    // other options
})
```

To simplify debugging, you may also want to add the
`{ slowMo: 300 }` option to slow down all browser operations.
See <a href="https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions" target="_blank">Puppeteer documentation</a> for details.

Once live view is enabled, you can open `http://localhost:4321` and as the crawler runs,
you should see screenshots and HTML of the pages it opens displayed in your browser.

To use live view on the Apify Platform (after enabling it in your actor),
simply select the Live View tab in your actor run view.

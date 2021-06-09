---
id: version-0.22.4-puppeteer-pool
title: PuppeteerPool
original_id: puppeteer-pool
---

<a name="puppeteerpool"></a>

Manages a pool of Chrome browser instances controlled using [Puppeteer](https://github.com/puppeteer/puppeteer).

`PuppeteerPool` reuses Chrome instances and tabs using specific browser rotation and retirement policies. This is useful in order to facilitate
rotation of proxies, cookies or other settings in order to prevent detection of your web scraping bot, access web pages from various countries etc.

Additionally, the reuse of browser instances instances speeds up crawling, and the retirement of instances helps mitigate effects of memory leaks in
Chrome.

`PuppeteerPool` is internally used by the [`PuppeteerCrawler`](../api/puppeteer-crawler) class.

**Example usage:**

```javascript
const puppeteerPool = new PuppeteerPool({
    launchPuppeteerOptions: {
        // Use Chrome instead of Chromium
        useChrome: true,
        // Hide from bot detection
        stealth: true,
    },
});

const page1 = await puppeteerPool.newPage();
const page2 = await puppeteerPool.newPage();

// ... do something with the pages ...

// Close all browsers.
await puppeteerPool.destroy();
```

---

<a name="puppeteerpool"></a>

## `new PuppeteerPool([options])`

**Parameters**:

-   **`[options]`**: [`PuppeteerPoolOptions`](../typedefs/puppeteer-pool-options) - All `PuppeteerPool` parameters are passed via an options object.

---

<a name="newpage"></a>

## `puppeteerPool.newPage()`

Produces a new page instance either by reusing an idle page that currently isn't processing any request or by spawning a new page (new browser tab) in
one of the available browsers when no idle pages are available.

To spawn a new browser tab for each page, set the `reusePages` constructor option to false.

**Returns**:

`Promise<Page>`

---

<a name="destroy"></a>

## `puppeteerPool.destroy()`

Closes all open browsers.

**Returns**:

`Promise<void>`

---

<a name="retire"></a>

## `puppeteerPool.retire(browser)`

Manually retires a Puppeteer [`Browser`](https://pptr.dev/#?product=Puppeteer&show=api-class-browser) instance from the pool. The browser will
continue to process open pages so that they may gracefully finish. This is unlike `browser.close()` which will forcibly terminate the browser and all
open pages will be closed.

**Parameters**:

-   **`browser`**: `Browser`

**Returns**:

`Promise<void>`

---

<a name="recyclepage"></a>

## `puppeteerPool.recyclePage(page)`

Closes the page, unless the `reuseTabs` option is set to true. Then it would only flag the page for a future reuse, without actually closing it.

NOTE: LiveView snapshotting is tied to this function. When `useLiveView` option is set to true, a snapshot of the page will be taken just before
closing the page or flagging it for reuse.

**Parameters**:

-   **`page`**: `Page`

**Returns**:

`Promise<void>`

---

<a name="serveliveviewsnapshot"></a>

## `puppeteerPool.serveLiveViewSnapshot(page)`

Tells the connected LiveViewServer to serve a snapshot when available.

**Parameters**:

-   **`page`**: `Page`

**Returns**:

`Promise<void>`

---

---
id: puppeteerpool
title: PuppeteerPool
---

<a name="PuppeteerPool"></a>

Manages a pool of Chrome browser instances controlled using <a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.

`PuppeteerPool` reuses Chrome instances and tabs using specific browser rotation and retirement policies. This is useful in order to facilitate
rotation of proxies, cookies or other settings in order to prevent detection of your web scraping bot, access web pages from various countries etc.

Additionally, the reuse of browser instances instances speeds up crawling, and the retirement of instances helps mitigate effects of memory leaks in
Chrome.

`PuppeteerPool` is internally used by the [`PuppeteerCrawler`](puppeteercrawler) class.

**Example usage:**

```javascript
const puppeteerPool = new PuppeteerPool({
    launchPuppeteerFunction: () => {
        // Use a new proxy with a new IP address for each new Chrome instance
        return Apify.launchPuppeteer({
            useApifyProxy: true,
            apifyProxySession: Math.random(),
        });
    },
});

const page1 = await puppeteerPool.newPage();
const page2 = await puppeteerPool.newPage();
const page3 = await puppeteerPool.newPage();

// ... do something with the pages ...

// Close all browsers.
await puppeteerPool.destroy();
```

-   [PuppeteerPool](puppeteerpool)
    -   [`new PuppeteerPool([options])`](#new_PuppeteerPool_new)
    -   [`.newPage()`](#PuppeteerPool+newPage) ⇒ `Promise<Page>`
    -   [`.destroy()`](#PuppeteerPool+destroy) ⇒ `Promise<void>`
    -   [`.retire(browser)`](#PuppeteerPool+retire) ⇒ `Promise<void>`
    -   [`.recyclePage(page)`](#PuppeteerPool+recyclePage) ⇒ `Promise<void>`
    -   [`.serveLiveViewSnapshot(page)`](#PuppeteerPool+serveLiveViewSnapshot) ⇒ `Promise<void>`

<a name="new_PuppeteerPool_new"></a>

## `new PuppeteerPool([options])`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/puppeteerpooloptions">PuppeteerPoolOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>PuppeteerPool</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr></tbody>
</table>
<a name="PuppeteerPool+newPage"></a>

## `puppeteerPool.newPage()` ⇒ `Promise<Page>`

Produces a new page instance either by reusing an idle page that currently isn't processing any request or by spawning a new page (new browser tab) in
one of the available browsers when no idle pages are available.

To spawn a new browser tab for each page, set the `reusePages` constructor option to false.

<a name="PuppeteerPool+destroy"></a>

## `puppeteerPool.destroy()` ⇒ `Promise<void>`

Closes all open browsers.

<a name="PuppeteerPool+retire"></a>

## `puppeteerPool.retire(browser)` ⇒ `Promise<void>`

Manually retires a Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-browser" target="_blank"><code>Browser</code></a> instance
from the pool. The browser will continue to process open pages so that they may gracefully finish. This is unlike `browser.close()` which will
forcibly terminate the browser and all open pages will be closed.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>browser</code></td><td><code>Browser</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="PuppeteerPool+recyclePage"></a>

## `puppeteerPool.recyclePage(page)` ⇒ `Promise<void>`

Closes the page, unless the `reuseTabs` option is set to true. Then it would only flag the page for a future reuse, without actually closing it.

NOTE: LiveView snapshotting is tied to this function. When `useLiveView` option is set to true, a snapshot of the page will be taken just before
closing the page or flagging it for reuse.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="PuppeteerPool+serveLiveViewSnapshot"></a>

## `puppeteerPool.serveLiveViewSnapshot(page)` ⇒ `Promise<void>`

Tells the connected LiveViewServer to serve a snapshot when available.

<table>
<thead>
<tr>
<th>Param</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td>
</tr>
<tr>
</tr></tbody>
</table>

---
id: puppeteerpool
title: PuppeteerPool
---

<a name="PuppeteerPool"></a>

Manages a pool of Chrome browser instances controlled using
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>.

`PuppeteerPool` reuses Chrome instances and tabs using specific browser rotation and retirement policies.
This is useful in order to facilitate rotation of proxies, cookies
or other settings in order to prevent detection of your web scraping bot,
access web pages from various countries etc.

Additionally, the reuse of browser instances instances speeds up crawling,
and the retirement of instances helps mitigate effects of memory leaks in Chrome.

`PuppeteerPool` is internally used by the [`PuppeteerCrawler`](puppeteercrawler) class.

**Example usage:**

```javascript
const puppeteerPool = new PuppeteerPool({
    launchPuppeteerFunction: () => {
        // Use a new proxy with a new IP address for each new Chrome instance
        return Apify.launchPuppeteer({
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
    -   [`.destroy()`](#PuppeteerPool+destroy) ⇒ `Promise`
    -   [`.retire(browser)`](#PuppeteerPool+retire) ⇒ `Promise`
    -   [`.recyclePage(page)`](#PuppeteerPool+recyclePage) ⇒ `Promise`
    -   [`.serveLiveViewSnapshot(page)`](#PuppeteerPool+serveLiveViewSnapshot) ⇒ `Promise`

<a name="new_PuppeteerPool_new"></a>

## `new PuppeteerPool([options])`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>PuppeteerPool</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>[options.useLiveView]</code></td><td><code>boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Enables the use of a preconfigured <a href="liveviewserver"><code>LiveViewServer</code></a> that serves snapshots
  just before a page would be recycled by <code>PuppeteerPool</code>. If there are no clients
  connected, it has close to zero impact on performance.</p>
</td></tr><tr>
<td><code>[options.maxOpenPagesPerInstance]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.</p>
</td></tr><tr>
<td><code>[options.retireInstanceAfterRequestCount]</code></td><td><code>Number</code></td><td><code>100</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum number of requests that can be processed by a single browser instance.
  After the limit is reached, the browser is retired and new requests are
  handled by a new browser instance.</p>
</td></tr><tr>
<td><code>[options.puppeteerOperationTimeoutSecs]</code></td><td><code>Number</code></td><td><code>15</code></td>
</tr>
<tr>
<td colspan="3"><p>All browser management operations such as launching a new browser, opening a new page
  or closing a page will timeout after the set number of seconds and the connected
  browser will be retired.</p>
</td></tr><tr>
<td><code>[options.instanceKillerIntervalSecs]</code></td><td><code>Number</code></td><td><code>60</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates how often are the open Puppeteer instances checked whether they can be closed.</p>
</td></tr><tr>
<td><code>[options.killInstanceAfterSecs]</code></td><td><code>Number</code></td><td><code>300</code></td>
</tr>
<tr>
<td colspan="3"><p>When Puppeteer instance reaches the <code>options.retireInstanceAfterRequestCount</code> limit then
  it is considered retired and no more tabs will be opened. After the last tab is closed the
  whole browser is closed too. This parameter defines a time limit between the last tab was opened and
  before the browser is closed even if there are pending open tabs.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Overrides the default function to launch a new Puppeteer instance.
  The function must return a promise resolving to
  <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-browser"><code>Browser</code></a> instance.
  See the source code on
  <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28" target="_blank">GitHub</a>
  for the default implementation.</p>
</td></tr><tr>
<td><code>[options.launchPuppeteerOptions]</code></td><td><code><a href="../typedefs/launchpuppeteeroptions">LaunchPuppeteerOptions</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Options used by <code>Apify.launchPuppeteer()</code> to start new Puppeteer instances.
  See <a href="../typedefs/launchpuppeteeroptions"><code>LaunchPuppeteerOptions</code></a>.</p>
</td></tr><tr>
<td><code>[options.recycleDiskCache]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>Enables recycling of disk cache directories by Chrome instances.
  When a browser instance is closed, its disk cache directory is not deleted but it&#39;s used by a newly opened browser instance.
  This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.
  Note that the new browser starts with empty cookies, local storage etc. so this setting doesn&#39;t affect anonymity of your crawler.</p>
<p>  Beware that the disk cache directories can consume a lot of disk space.
  To limit the space consumed, you can pass the <code>--disk-cache-size=X</code> argument to <code>options.launchPuppeteerOptions.args</code>,
  where <code>X</code> is the approximate maximum number of bytes for disk cache.</p>
<p>  Do not use the <code>options.recycleDiskCache</code> setting together with <code>--disk-cache-dir</code>
  argument in <code>options.launchPuppeteerOptions.args</code>, the behavior is undefined.</p>
</td></tr><tr>
<td><code>[options.proxyUrls]</code></td><td><code>Array<String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of custom proxy URLs to be used by the <code>PuppeteerPool</code> instance.
  The provided custom proxies&#39; order will be randomized and the resulting list rotated.
  Custom proxies are not compatible with Apify Proxy and an attempt to use both
  configuration options will cause an error to be thrown on startup.</p>
</td></tr></tbody>
</table>
<a name="PuppeteerPool+newPage"></a>

## `puppeteerPool.newPage()` ⇒ `Promise<Page>`

Produces a new page instance either by reusing an idle page that currently isn't processing
any request or by spawning a new page (new browser tab) in one of the available
browsers when no idle pages are available.

To spawn a new browser tab for each page, set the `reusePages` constructor option to false.

<a name="PuppeteerPool+destroy"></a>

## `puppeteerPool.destroy()` ⇒ `Promise`

Closes all open browsers.

<a name="PuppeteerPool+retire"></a>

## `puppeteerPool.retire(browser)` ⇒ `Promise`

Manually retires a Puppeteer
<a href="https://pptr.dev/#?product=Puppeteer&show=api-class-browser" target="_blank"><code>Browser</code></a>
instance from the pool. The browser will continue to process open pages so that they may gracefully finish.
This is unlike `browser.close()` which will forcibly terminate the browser and all open pages will be closed.

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

## `puppeteerPool.recyclePage(page)` ⇒ `Promise`

Closes the page, unless the `reuseTabs` option is set to true.
Then it would only flag the page for a future reuse, without actually closing it.

NOTE: LiveView snapshotting is tied to this function. When `useLiveView` option
is set to true, a snapshot of the page will be taken just before closing the page
or flagging it for reuse.

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

## `puppeteerPool.serveLiveViewSnapshot(page)` ⇒ `Promise`

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

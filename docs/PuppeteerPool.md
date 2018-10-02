---
id: puppeteerpool
title: PuppeteerPool
---
<a name="exp_module_PuppeteerPool--PuppeteerPool"></a>

## PuppeteerPool ⏏
Manages a pool of Chrome browser instances controlled using [Puppeteer](https://github.com/GoogleChrome/puppeteer).
`PuppeteerPool` reuses Chrome instances and tabs using specific
browser rotation and retirement policies.
This is useful in order to facilitate rotation of proxies, cookies
or other settings in order to prevent detection of your web scraping bot,
access web pages from various countries etc.
Additionally, the reuse of browser instances instances speeds up crawling,
and the retirement of instances helps mitigate effects of memory leaks in Chrome.

`PuppeteerPool` is internally used by the [`PuppeteerCrawler`](PuppeteerCrawler) class.

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

**Kind**: global class of [<code>PuppeteerPool</code>](#module_PuppeteerPool)  
* [PuppeteerPool](#exp_module_PuppeteerPool--PuppeteerPool) ⏏
    * [`new PuppeteerPool()`](#new_module_PuppeteerPool--PuppeteerPool_new)
    * [`.newPage()`](#module_PuppeteerPool--PuppeteerPool+newPage) ⇒ <code>Promise.&lt;Puppeteer.Page&gt;</code>
    * [`.destroy()`](#module_PuppeteerPool--PuppeteerPool+destroy) ⇒ <code>Promise</code>
    * [`.retire(browser)`](#module_PuppeteerPool--PuppeteerPool+retire) ⇒ <code>Promise</code>

<a name="new_module_PuppeteerPool--PuppeteerPool_new"></a>

### `new PuppeteerPool()`

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options.maxOpenPagesPerInstance] | <code>Number</code> | <code>50</code> | Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance. |
| [options.retireInstanceAfterRequestCount] | <code>Number</code> | <code>100</code> | Maximum number of requests that can be processed by a single browser instance.   After the limit is reached, the browser is retired and new requests are   be handled by a new browser instance. |
| [options.instanceKillerIntervalMillis] | <code>Number</code> | <code>60000</code> | Indicates how often opened Puppeteer instances are checked whether they can be closed. |
| [options.killInstanceAfterMillis] | <code>Number</code> | <code>300000</code> | When Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then   it is considered retired and no more tabs will be opened. After the last tab is closed the   whole browser is closed too. This parameter defines a time limit between the last tab was opened and   before the browser is closed even if there are pending open tabs. |
| [options.launchPuppeteerFunction] | <code>function</code> | <code>launchPuppeteerOptions&amp;nbsp;&#x3D;&gt;&amp;nbsp;Apify.launchPuppeteer(launchPuppeteerOptions)</code> | Overrides the default function to launch a new `Puppeteer` instance. |
| [options.launchPuppeteerOptions] | [<code>LaunchPuppeteerOptions</code>](#LaunchPuppeteerOptions) |  | Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances. |
| [options.recycleDiskCache] | <code>Boolean</code> |  | Enables recycling of disk cache directories by Chrome instances.   When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.   This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.   Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.   Beware that the disk cache directories can consume a lot of disk space.   To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `options.launchPuppeteerOptions.args`,   where `X` is the approximate maximum number of bytes for disk cache.   *IMPORTANT:* Currently this feature only works in headful mode, because of a bug in Chromium.   The `options.recycleDiskCache` setting should not be used together with `--disk-cache-dir` argument in `options.launchPuppeteerOptions.args`. |

<a name="module_PuppeteerPool--PuppeteerPool+newPage"></a>

### `puppeteerPool.newPage()` ⇒ <code>Promise.&lt;Puppeteer.Page&gt;</code>
Opens new tab in one of the browsers and returns promise that resolves to its Puppeteer.Page.

**Kind**: instance method of [<code>PuppeteerPool</code>](#exp_module_PuppeteerPool--PuppeteerPool)  
<a name="module_PuppeteerPool--PuppeteerPool+destroy"></a>

### `puppeteerPool.destroy()` ⇒ <code>Promise</code>
Closes all the browsers.

**Kind**: instance method of [<code>PuppeteerPool</code>](#exp_module_PuppeteerPool--PuppeteerPool)  
<a name="module_PuppeteerPool--PuppeteerPool+retire"></a>

### `puppeteerPool.retire(browser)` ⇒ <code>Promise</code>
Manually retires a Puppeteer Browser instance from the pool. The browser will continue
to process open pages so that they may gracefully finish. This is unlike browser.close()
which will forcibly terminate the browser and all open pages will be closed.

**Kind**: instance method of [<code>PuppeteerPool</code>](#exp_module_PuppeteerPool--PuppeteerPool)  

| Param | Type |
| --- | --- |
| browser | <code>Puppeteer.Browser</code> | 


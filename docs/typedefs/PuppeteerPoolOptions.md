---
id: puppeteer-pool-options
title: PuppeteerPoolOptions
---

<a name="puppeteerpooloptions"></a>

## Properties

### `useLiveView`

**Type**: `boolean`

Enables the use of a preconfigured [`LiveViewServer`](/docs/api/live-view-server) that serves snapshots just before a page would be recycled by
`PuppeteerPool`. If there are no clients connected, it has close to zero impact on performance.

---

### `maxOpenPagesPerInstance`

**Type**: `number` <code> = 50</code>

Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance.

---

### `retireInstanceAfterRequestCount`

**Type**: `number` <code> = 100</code>

Maximum number of requests that can be processed by a single browser instance. After the limit is reached, the browser is retired and new requests are
handled by a new browser instance.

---

### `puppeteerOperationTimeoutSecs`

**Type**: `number` <code> = 15</code>

All browser management operations such as launching a new browser, opening a new page or closing a page will timeout after the set number of seconds
and the connected browser will be retired.

---

### `instanceKillerIntervalSecs`

**Type**: `number` <code> = 60</code>

Indicates how often are the open Puppeteer instances checked whether they can be closed.

---

### `killInstanceAfterSecs`

**Type**: `number` <code> = 300</code>

When Puppeteer instance reaches the `retireInstanceAfterRequestCount` limit then it is considered retired and no more tabs will be opened. After the
last tab is closed the whole browser is closed too. This parameter defines a time limit between the last tab was opened and before the browser is
closed even if there are pending open tabs.

---

### `launchPuppeteerFunction`

**Type**: [`LaunchPuppeteerFunction`](/docs/typedefs/launch-puppeteer-function)

Overrides the default function to launch a new Puppeteer instance. The function must return a promise resolving to
[`Browser`](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-browser) instance. See the source code on
[GitHub](https://github.com/apifytech/apify-js/blob/master/src/puppeteer_pool.js#L28) for the default implementation.

---

### `launchPuppeteerOptions`

**Type**: [`LaunchPuppeteerOptions`](/docs/typedefs/launch-puppeteer-options)

Options used by [`Apify.launchPuppeteer()`](/docs/api/apify#launchpuppeteer) to start new Puppeteer instances.

---

### `recycleDiskCache`

**Type**: `boolean` <code> = false</code>

Enables recycling of disk cache directories by Chrome instances. When a browser instance is closed, its disk cache directory is not deleted but it's
used by a newly opened browser instance. This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy
usage. Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.

Beware that the disk cache directories can consume a lot of disk space. To limit the space consumed, you can pass the `--disk-cache-size=X` argument
to `launchPuppeteerargs`, where `X` is the approximate maximum number of bytes for disk cache.

Do not use the `recycleDiskCache` setting together with `--disk-cache-dir` argument in `launchPuppeteerargs`, the behavior is undefined.

---

### `useIncognitoPages`

**Type**: `boolean`

With this option selected, all pages will be opened in a new incognito browser context, which means that they will not share cookies or cache and
their resources will not be throttled by one another.

---

### `proxyUrls`

**Type**: `Array<string>`

An array of custom proxy URLs to be used by the `PuppeteerPool` instance. The provided custom proxies' order will be randomized and the resulting list
rotated. Custom proxies are not compatible with Apify Proxy and an attempt to use both configuration options will cause an error to be thrown on
startup.

---

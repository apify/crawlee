---
id: version-0.22.4-puppeteer-handle-page-inputs
title: PuppeteerHandlePageInputs
original_id: puppeteer-handle-page-inputs
---

<a name="puppeteerhandlepageinputs"></a>

## Properties

### `request`

**Type**: [`Request`](../api/request)

An instance of the [`Request`](../api/request) object with details about the URL to open, HTTP method etc.

---

### `response`

**Type**: `PuppeteerResponse`

An instance of the Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&show=api-class-response), which is the main resource response as
returned by `page.goto(request.url)`.

---

### `page`

**Type**: `PuppeteerPage`

is an instance of the Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page)

---

### `puppeteerPool`

**Type**: [`PuppeteerPool`](../api/puppeteer-pool)

An instance of the [`PuppeteerPool`](../api/puppeteer-pool) used by this `PuppeteerCrawler`.

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](../api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](../api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property is
only initialized after calling the [`PuppeteerCrawler.run()`](../api/puppeteer-crawler#run) function. You can use it to change the concurrency
settings on the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](../api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](../api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](../api/session)

---

### `proxyInfo`

**Type**: [`ProxyInfo`](../typedefs/proxy-info)

---

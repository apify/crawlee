---
id: puppeteer-handle-page-inputs
title: PuppeteerHandlePageInputs
---

<a name="puppeteerhandlepageinputs"></a>

## Properties

### `request`

**Type**: [`Request`](/docs/api/request)

An instance of the [`Request`](/docs/api/request) object with details about the URL to open, HTTP method etc.

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

**Type**: [`PuppeteerPool`](/docs/api/puppeteer-pool)

An instance of the [`PuppeteerPool`](/docs/api/puppeteer-pool) used by this `PuppeteerCrawler`.

---

### `autoscaledPool`

**Type**: [`AutoscaledPool`](/docs/api/autoscaled-pool)

A reference to the underlying [`AutoscaledPool`](/docs/api/autoscaled-pool) class that manages the concurrency of the crawler. Note that this property
is only initialized after calling the [`PuppeteerCrawler.run()`](/docs/api/puppeteer-crawler#run) function. You can use it to change the concurrency
settings on the fly, to pause the crawler by calling [`AutoscaledPool.pause()`](/docs/api/autoscaled-pool#pause) or to abort it by calling
[`AutoscaledPool.abort()`](/docs/api/autoscaled-pool#abort).

---

### `session`

**Type**: [`Session`](/docs/api/session)

---

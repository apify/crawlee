---
id: puppeteercrawler
title: PuppeteerCrawler
---

<a name="PuppeteerCrawler"></a>

Provides a simple framework for parallel crawling of web pages using headless Chrome with
<a href="https://github.com/GoogleChrome/puppeteer" target="_blank">Puppeteer</a>. The URLs to crawl are fed either from a static list of URLs or from
a dynamic queue of URLs enabling recursive crawling of websites.

Since `PuppeteerCrawler` uses headless Chrome to download web pages and extract data, it is useful for crawling of websites that require to execute
JavaScript. If the target website doesn't need JavaScript, consider using [`CheerioCrawler`](cheeriocrawler), which downloads the pages using raw HTTP
requests and is about 10x faster.

The source URLs are represented using [`Request`](request) objects that are fed from [`RequestList`](requestlist) or [`RequestQueue`](requestqueue)
instances provided by the [`requestList`](#new_PuppeteerCrawler_new) or [`requestQueue`](#new_PuppeteerCrawler_new) constructor options, respectively.

If both [`requestList`](#new_PuppeteerCrawler_new) and [`requestQueue`](#new_PuppeteerCrawler_new) are used, the instance first processes URLs from
the [`RequestList`](requestlist) and automatically enqueues all of them to [`RequestQueue`](requestqueue) before it starts their processing. This
ensures that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](request) objects to crawl.

`PuppeteerCrawler` opens a new Chrome page (i.e. tab) for each [`Request`](request) object to crawl and then calls the function provided by user as
the [`handlePageFunction()`](#new_PuppeteerCrawler_new) option.

New pages are only opened when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](autoscaledpool) class. All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `PuppeteerCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [`AutoscaledPool`](autoscaledpool)
options are available directly in the `PuppeteerCrawler` constructor.

Note that the pool of Puppeteer instances is internally managed by the [`PuppeteerPool`](puppeteerpool) class. Many constructor options such as
`maxOpenPagesPerInstance` or `launchPuppeteerFunction` are passed directly to [`PuppeteerPool`](puppeteerpool) constructor.

**Example usage:**

```javascript
const crawler = new Apify.PuppeteerCrawler({
    requestList,
    handlePageFunction: async ({ page, request }) => {
        // This function is called to extract data from a single web page
        // 'page' is an instance of Puppeteer.Page with page.goto(request.url) already called
        // 'request' is an instance of Request class with information about the page to load
        await Apify.pushData({
            title: await page.title(),
            url: request.url,
            succeeded: true,
        });
    },
    handleFailedRequestFunction: async ({ request }) => {
        // This function is called when the crawling of a request failed too many times
        await Apify.pushData({
            url: request.url,
            succeeded: false,
            errors: request.errorMessages,
        });
    },
});

await crawler.run();
```

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>autoscaledPool</code></td><td><code><a href="autoscaledpool">AutoscaledPool</a></code></td>
</tr>
<tr>
<td colspan="3"><p>A reference to the underlying <a href="autoscaledpool"><code>AutoscaledPool</code></a> class that manages the concurrency of the crawler.
 Note that this property is only initialized after calling the <a href="#PuppeteerCrawler+run"><code>run</code></a> function.
 You can use it to change the concurrency settings on the fly,
 to pause the crawler by calling <a href="#AutoscaledPool+pause"><code>pause</code></a>
 or to abort it by calling <a href="#AutoscaledPool+abort"><code>abort</code></a>.</p>
</td></tr></tbody>
</table>

-   [PuppeteerCrawler](puppeteercrawler)
    -   [`new PuppeteerCrawler(options)`](#new_PuppeteerCrawler_new)
    -   [`.run()`](#PuppeteerCrawler+run) ⇒ `Promise<void>`

<a name="new_PuppeteerCrawler_new"></a>

## `new PuppeteerCrawler(options)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/puppeteercrawleroptions">PuppeteerCrawlerOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>PuppeteerCrawler</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr></tbody>
</table>
<a name="PuppeteerCrawler+run"></a>

## `puppeteerCrawler.run()` ⇒ `Promise<void>`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.

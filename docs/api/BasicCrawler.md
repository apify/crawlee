---
id: basiccrawler
title: BasicCrawler
---

<a name="BasicCrawler"></a>

Provides a simple framework for parallel crawling of web pages. The URLs to crawl are fed either from a static list of URLs or from a dynamic queue of
URLs enabling recursive crawling of websites.

`BasicCrawler` is a low-level tool that requires the user to implement the page download and data extraction functionality themselves. If you want a
crawler that already facilitates this functionality, please consider using [`PuppeteerCrawler`](puppeteercrawler) or
[`CheerioCrawler`](cheeriocrawler).

`BasicCrawler` invokes the user-provided [`handleRequestFunction()`](#new_BasicCrawler_new) for each [`Request`](request) object, which represents a
single URL to crawl. The [`Request`](request) objects are fed from the [`RequestList`](requestlist) or the [`RequestQueue`](requestqueue) instances
provided by the [`requestList`](#new_BasicCrawler_new) or [`requestQueue`](#new_BasicCrawler_new) constructor options, respectively.

If both [`requestList`](#new_BasicCrawler_new) and [`requestQueue`](#new_BasicCrawler_new) options are used, the instance first processes URLs from
the [`RequestList`](requestlist) and automatically enqueues all of them to [`RequestQueue`](requestqueue) before it starts their processing. This
ensures that a single URL is not crawled multiple times.

The crawler finishes if there are no more [`Request`](request) objects to crawl.

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](autoscaledpool) class. All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `BasicCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [`AutoscaledPool`](autoscaledpool)
options are available directly in the `BasicCrawler` constructor.

**Example usage:**

```javascript
const rp = require('request-promise-native');

// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
    sources: [{ url: 'http://www.example.com/page-1' }, { url: 'http://www.example.com/page-2' }],
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.BasicCrawler({
    requestList,
    handleRequestFunction: async ({ request }) => {
        // 'request' contains an instance of the Request class
        // Here we simply fetch the HTML of the page and store it to a dataset
        await Apify.pushData({
            url: request.url,
            html: await rp(request.url),
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
 Note that this property is only initialized after calling the <a href="#BasicCrawler+run"><code>run</code></a> function.
 You can use it to change the concurrency settings on the fly,
 to pause the crawler by calling <a href="#AutoscaledPool+pause"><code>pause</code></a>
 or to abort it by calling <a href="#AutoscaledPool+abort"><code>abort</code></a>.</p>
</td></tr></tbody>
</table>

-   [BasicCrawler](basiccrawler)
    -   [`new BasicCrawler(options)`](#new_BasicCrawler_new)
    -   [`.run()`](#BasicCrawler+run) ⇒ `Promise<void>`

<a name="new_BasicCrawler_new"></a>

## `new BasicCrawler(options)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/basiccrawleroptions">BasicCrawlerOptions</a></code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="BasicCrawler+run"></a>

## `basicCrawler.run()` ⇒ `Promise<void>`

Runs the crawler. Returns a promise that gets resolved once all the requests are processed.

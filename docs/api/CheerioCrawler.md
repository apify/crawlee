---
id: cheeriocrawler
title: CheerioCrawler
---

<a name="CheerioCrawler"></a>

Provides a framework for the parallel crawling of web pages using plain HTTP requests and
<a href="https://www.npmjs.com/package/cheerio" target="_blank">cheerio</a> HTML parser. The URLs to crawl are fed either from a static list of URLs
or from a dynamic queue of URLs enabling recursive crawling of websites.

Since `CheerioCrawler` uses raw HTTP requests to download web pages, it is very fast and efficient on data bandwidth. However, if the target website
requires JavaScript to display the content, you might need to use [`PuppeteerCrawler`](puppeteercrawler) instead, because it loads the pages using
full-featured headless Chrome browser.

`CheerioCrawler` downloads each URL using a plain HTTP request, parses the HTML content using
<a href="https://www.npmjs.com/package/cheerio" target="_blank">Cheerio</a> and then invokes the user-provided
[`handlePageFunction()`](#new_CheerioCrawler_new) to extract page data using a <a href="https://jquery.com/" target="_blank">jQuery</a>-like interface
to the parsed HTML DOM.

The source URLs are represented using [`Request`](request) objects that are fed from [`RequestList`](requestlist) or [`RequestQueue`](requestqueue)
instances provided by the [`requestList`](#new_CheerioCrawler_new) or [`requestQueue`](#new_CheerioCrawler_new) constructor options, respectively.

If both [`requestList`](#new_CheerioCrawler_new) and [`requestQueue`](#new_CheerioCrawler_new) are used, the instance first processes URLs from the
[`RequestList`](requestlist) and automatically enqueues all of them to [`RequestQueue`](requestqueue) before it starts their processing. This ensures
that a single URL is not crawled multiple times.

The crawler finishes when there are no more [`Request`](request) objects to crawl.

`CheerioCrawler` downloads the web pages using the [`requestAsBrowser`](requestasbrowser) utility function. You can use the `requestOptions` parameter
to pass additional options to this function.

By default, `CheerioCrawler` only processes web pages with the `text/html` and `application/xhtml+xml` MIME content types (as reported by the
`Content-Type` HTTP header), and skips pages with other content types. If you want the crawler to process other content types, use the
[`additionalMimeTypes`](#new_CheerioCrawler_new) constructor option. Beware that the parsing behavior differs for HTML, XML, JSON and other types of
content. For details, see [`CheerioCrawlerOptions#handlePageFunction`](cheeriocrawleroptions#handlepagefunction).

New requests are only dispatched when there is enough free CPU and memory available, using the functionality provided by the
[`AutoscaledPool`](autoscaledpool) class. All [`AutoscaledPool`](autoscaledpool) configuration options can be passed to the `autoscaledPoolOptions`
parameter of the `CheerioCrawler` constructor. For user convenience, the `minConcurrency` and `maxConcurrency` [`AutoscaledPool`](autoscaledpool)
options are available directly in the `CheerioCrawler` constructor.

**Example usage:**

```javascript
// Prepare a list of URLs to crawl
const requestList = new Apify.RequestList({
    sources: [{ url: 'http://www.example.com/page-1' }, { url: 'http://www.example.com/page-2' }],
});
await requestList.initialize();

// Crawl the URLs
const crawler = new Apify.CheerioCrawler({
    requestList,
    handlePageFunction: async ({ request, response, body, contentType, $ }) => {
        const data = [];

        // Do some data extraction from the page with Cheerio.
        $('.some-collection').each((index, el) => {
            data.push({
                title: $(el)
                    .find('.some-title')
                    .text(),
            });
        });

        // Save the data to dataset.
        await Apify.pushData({
            url: request.url,
            html: body,
            data,
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
 Note that this property is only initialized after calling the <a href="#CheerioCrawler+run"><code>run</code></a> function.
 You can use it to change the concurrency settings on the fly,
 to pause the crawler by calling <a href="#AutoscaledPool+pause"><code>pause</code></a>
 or to abort it by calling <a href="#AutoscaledPool+abort"><code>abort</code></a>.</p>
</td></tr></tbody>
</table>

-   [CheerioCrawler](cheeriocrawler)
    -   [`new CheerioCrawler(options)`](#new_CheerioCrawler_new)
    -   [`.run()`](#CheerioCrawler+run) ⇒ `Promise`

<a name="new_CheerioCrawler_new"></a>

## `new CheerioCrawler(options)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/cheeriocrawleroptions">CheerioCrawlerOptions</a></code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="CheerioCrawler+run"></a>

## `cheerioCrawler.run()` ⇒ `Promise`

Runs the crawler. Returns promise that gets resolved once all the requests got processed.

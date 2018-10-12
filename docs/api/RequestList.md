---
id: requestlist
title: RequestList
---
<a name="exp_module_RequestList--RequestList"></a>

Represents a static list of URLs to crawl.
The URLs can be provided either in code or parsed from a text file hosted on the web.

Each URL is represented using an instance of the [`Request`](request) class.
The list can only contain unique URLs. More precisely, it can only contain `Request` instances
with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
To add a single URL multiple times to the list,
corresponding `Request` objects will need to have different `uniqueKey` properties.
You can use the `keepDuplicateUrls` option to do this for you.

Once you create an instance of `RequestList`, you need to call [`initialize()`](requestlist#initialize)
before the instance can be used. After that, no more URLs can be added to the list.

`RequestList` is used by [`BasicCrawler`](basiccrawler), [`CheerioCrawler`](cheeriocrawler)
and [`PuppeteerCrawler`](puppeteercrawler) as a source of URLs to crawl.
Unlike [`RequestQueue`](#requestqueue), `RequestList` is static but it can contain even millions of URLs.

`RequestList` has an internal state where it stores information which requests were handled,
which are in progress or which were reclaimed.
The state might be automatically persisted to the default key-value store by setting the `persistStateKey` option
so that if the Node.js process is restarted,
the crawling can continue where it left off. For more details, see [`KeyValueStore`](#keyvaluestore).

**Example usage:**

```javascript
const requestList = new Apify.RequestList({
    sources: [
        // Separate requests
        { url: 'http://www.example.com/page-1', method: 'GET', headers: {} },
        { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},

        // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
        // Note that all URLs must start with http:// or https://
        { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
    ],
    persistStateKey: 'my-crawling-state'
});

// This call loads and parses the URLs from the remote file.
await requestList.initialize();

// Get requests from list
const request1 = await requestList.fetchNextRequest();
const request2 = await requestList.fetchNextRequest();
const request3 = await requestList.fetchNextRequest();

// Mark some of them as handled
await requestList.markRequestHandled(request1);

// If processing fails then reclaim it back to the list
await requestList.reclaimRequest(request2);
```


---
id: request-list
title: RequestList
---

<a name="requestlist"></a>

Represents a static list of URLs to crawl. The URLs can be provided either in code or parsed from a text file hosted on the web.

Each URL is represented using an instance of the [`Request`](/docs/api/request) class. The list can only contain unique URLs. More precisely, it can
only contain `Request` instances with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be
overridden. To add a single URL to the list multiple times, corresponding [`Request`](/docs/api/request) objects will need to have different
`uniqueKey` properties. You can use the `keepDuplicateUrls` option to do this for you when initializing the `RequestList` from sources.

Once you create an instance of `RequestList`, you need to call the [`RequestList.initialize()`](/docs/api/request-list#initialize) function before the
instance can be used. After that, no more URLs can be added to the list.

`RequestList` is used by [`BasicCrawler`](/docs/api/basic-crawler), [`CheerioCrawler`](/docs/api/cheerio-crawler) and
[`PuppeteerCrawler`](/docs/api/puppeteer-crawler) as a source of URLs to crawl. Unlike [`RequestQueue`](/docs/api/request-queue), `RequestList` is
static but it can contain even millions of URLs.

`RequestList` has an internal state where it stores information about which requests were already handled, which are in progress and which were
reclaimed. The state may be automatically persisted to the default [`KeyValueStore`](/docs/api/key-value-store) by setting the `persistStateKey`
option so that if the Node.js process is restarted, the crawling can continue where it left off. The automated persisting is launched upon receiving
the `persistState` event that is periodically emitted by [`Apify.events`](/docs/api/apify#events).

The internal state is closely tied to the provided sources (URLs). If the sources change on actor restart, the state will become corrupted and
`RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web. In such case, use the
`persistSourcesKey` option in conjunction with `persistStateKey`, to make the `RequestList` store the initial sources to the default key-value store
and load them after restart, which will prevent any issues that a live list of URLs might cause.

**Example usage:**

```javascript
const requestList = new Apify.RequestList({
    sources: [
        // Separate requests
        { url: 'http://www.example.com/page-1', method: 'GET', headers: {} },
        { url: 'http://www.example.com/page-2', userData: { foo: 'bar' } },

        // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
        // Note that all URLs must start with http:// or https://
        { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
    ],

    // Ensure both the sources and crawling state of the request list is persisted,
    // so that on actor restart, the crawling will continue where it left off
    persistStateKey: 'my-state',
    persistSourcesKey: 'my-sources',
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

---

<a name="exports.requestlist"></a>

## `new RequestList(options)`

**Params**

-   **`options`**: [`RequestListOptions`](/docs/typedefs/request-list-options) - All `RequestList` configuration options

---

<a name="initialize"></a>

## `requestList.initialize()`

**Returns**: `Promise<void>`

Loads all remote sources of URLs and potentially starts periodic state persistence. This function must be called before you can start using the
instance in a meaningful way.

---

<a name="persiststate"></a>

## `requestList.persistState()`

**Returns**: `Promise<void>`

Persists the current state of the `RequestList` into the default [`KeyValueStore`](/docs/api/key-value-store). The state is persisted automatically in
regular intervals, but calling this method manually is useful in cases where you want to have the most current state available after you pause or stop
fetching its requests. For example after you pause or abort a crawl. Or just before a server migration.

---

<a name="getstate"></a>

## `requestList.getState()`

**Returns**: [`RequestListState`](/docs/typedefs/request-list-state)

Returns an object representing the internal state of the `RequestList` instance. Note that the object's fields can change in future releases.

---

<a name="isempty"></a>

## `requestList.isEmpty()`

**Returns**: `Promise<Boolean>`

Resolves to `true` if the next call to [`RequestList.fetchNextRequest()`](/docs/api/request-list#fetchnextrequest) function would return `null`,
otherwise it resolves to `false`. Note that even if the list is empty, there might be some pending requests currently being processed.

---

<a name="isfinished"></a>

## `requestList.isFinished()`

**Returns**: `Promise<Boolean>`

Returns `true` if all requests were already handled and there are no more left.

---

<a name="fetchnextrequest"></a>

## `requestList.fetchNextRequest()`

**Returns**: [`Promise<(Request|null)>`](/docs/api/request)

Gets the next [`Request`](/docs/api/request) to process. First, the function gets a request previously reclaimed using the
[`RequestList.reclaimRequest()`](/docs/api/request-list#reclaimrequest) function, if there is any. Otherwise it gets the next request from sources.

The function's `Promise` resolves to `null` if there are no more requests to process.

---

<a name="markrequesthandled"></a>

## `requestList.markRequestHandled(request)`

**Returns**: `Promise<void>`

Marks request as handled after successful processing.

**Params**

-   **`request`**: [`Request`](/docs/api/request)

---

<a name="reclaimrequest"></a>

## `requestList.reclaimRequest(request)`

**Returns**: `Promise<void>`

Reclaims request to the list if its processing failed. The request will become available in the next `this.fetchNextRequest()`.

**Params**

-   **`request`**: [`Request`](/docs/api/request)

---

<a name="length"></a>

## `requestList.length()`

**Returns**: `number`

Returns the total number of unique requests present in the `RequestList`.

---

<a name="handledcount"></a>

## `requestList.handledCount()`

**Returns**: `number`

Returns number of handled requests.

---

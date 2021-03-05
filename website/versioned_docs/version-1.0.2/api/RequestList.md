---
id: version-1.0.2-request-list
title: RequestList
original_id: request-list
---

<a name="requestlist"></a>

Represents a static list of URLs to crawl. The URLs can be provided either in code or parsed from a text file hosted on the web. `RequestList` is used
by [`BasicCrawler`](../api/basic-crawler), [`CheerioCrawler`](../api/cheerio-crawler), [`PuppeteerCrawler`](../api/puppeteer-crawler) and
[`PlaywrightCrawler`](../api/playwright-crawler) as a source of URLs to crawl.

Each URL is represented using an instance of the [`Request`](../api/request) class. The list can only contain unique URLs. More precisely, it can only
contain `Request` instances with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden. To
add a single URL to the list multiple times, corresponding [`Request`](../api/request) objects will need to have different `uniqueKey` properties. You
can use the `keepDuplicateUrls` option to do this for you when initializing the `RequestList` from sources.

Once you create an instance of `RequestList`, you need to call the [`RequestList.initialize()`](../api/request-list#initialize) function before the
instance can be used. After that, no more URLs can be added to the list. Unlike [`RequestQueue`](../api/request-queue), `RequestList` is static but it
can contain even millions of URLs.

> Note that `RequestList` can be used together with `RequestQueue` by the same crawler. In such cases, each request from `RequestList` is enqueued
> into `RequestQueue` first and then consumed from the latter. This is necessary to avoid the same URL being processed more than once (from the list
> first and then possibly from the queue). In practical terms, such a combination can be useful when there is a large number of initial URLs, but more
> URLs would be added dynamically by the crawler.

`RequestList` has an internal state where it stores information about which requests were already handled, which are in progress and which were
reclaimed. The state may be automatically persisted to the default [`KeyValueStore`](../api/key-value-store) by setting the `persistStateKey` option
so that if the Node.js process is restarted, the crawling can continue where it left off. The automated persisting is launched upon receiving the
`persistState` event that is periodically emitted by [`Apify.events`](../api/apify#events).

The internal state is closely tied to the provided sources (URLs). If the sources change on actor restart, the state will become corrupted and
`RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web. In such case, use the
`persistRequestsKey` option in conjunction with `persistStateKey`, to make the `RequestList` store the initial sources to the default key-value store
and load them after restart, which will prevent any issues that a live list of URLs might cause.

**Basic usage:**

```javascript
// Use a helper function to simplify request list initialization.
// State and sources are automatically persisted. This is a preferred usage.
const requestList = await Apify.openRequestList('my-request-list', [
    'http://www.example.com/page-1',
    { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' } },
    { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
]);
```

**Advanced usage:**

```javascript
// Use the constructor to get more control over the initialization.
const requestList = new Apify.RequestList({
    sources: [
        // Separate requests
        { url: 'http://www.example.com/page-1', method: 'GET', headers: { ... } },
        { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},

        // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
        // Note that all URLs must start with http:// or https://
        { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
    ],

    // Persist the state to avoid re-crawling which can lead to data duplications.
    // Keep in mind that the sources have to be immutable or this will throw an error.
    persistStateKey: 'my-state',
});

await requestList.initialize();
```

---

<a name="exports.requestlist"></a>

## `new RequestList(options)`

**Parameters**:

-   **`options`**: [`RequestListOptions`](../typedefs/request-list-options) - All `RequestList` configuration options

---

<a name="requests"></a>

## `requestList.requests`

---

<a name="initialize"></a>

## `requestList.initialize()`

Loads all remote sources of URLs and potentially starts periodic state persistence. This function must be called before you can start using the
instance in a meaningful way.

**Returns**:

`Promise<void>`

---

<a name="persiststate"></a>

## `requestList.persistState()`

Persists the current state of the `RequestList` into the default [`KeyValueStore`](../api/key-value-store). The state is persisted automatically in
regular intervals, but calling this method manually is useful in cases where you want to have the most current state available after you pause or stop
fetching its requests. For example after you pause or abort a crawl. Or just before a server migration.

**Returns**:

`Promise<void>`

---

<a name="getstate"></a>

## `requestList.getState()`

Returns an object representing the internal state of the `RequestList` instance. Note that the object's fields can change in future releases.

**Returns**:

[`RequestListState`](../typedefs/request-list-state)

---

<a name="isempty"></a>

## `requestList.isEmpty()`

Resolves to `true` if the next call to [`RequestList.fetchNextRequest()`](../api/request-list#fetchnextrequest) function would return `null`,
otherwise it resolves to `false`. Note that even if the list is empty, there might be some pending requests currently being processed.

**Returns**:

`Promise<boolean>`

---

<a name="isfinished"></a>

## `requestList.isFinished()`

Returns `true` if all requests were already handled and there are no more left.

**Returns**:

`Promise<boolean>`

---

<a name="fetchnextrequest"></a>

## `requestList.fetchNextRequest()`

Gets the next [`Request`](../api/request) to process. First, the function gets a request previously reclaimed using the
[`RequestList.reclaimRequest()`](../api/request-list#reclaimrequest) function, if there is any. Otherwise it gets the next request from sources.

The function's `Promise` resolves to `null` if there are no more requests to process.

**Returns**:

[`Promise<(Request|null)>`](../api/request)

---

<a name="markrequesthandled"></a>

## `requestList.markRequestHandled(request)`

Marks request as handled after successful processing.

**Parameters**:

-   **`request`**: [`Request`](../api/request)

**Returns**:

`Promise<void>`

---

<a name="reclaimrequest"></a>

## `requestList.reclaimRequest(request)`

Reclaims request to the list if its processing failed. The request will become available in the next `this.fetchNextRequest()`.

**Parameters**:

-   **`request`**: [`Request`](../api/request)

**Returns**:

`Promise<void>`

---

<a name="length"></a>

## `requestList.length()`

Returns the total number of unique requests present in the `RequestList`.

**Returns**:

`number`

---

<a name="handledcount"></a>

## `requestList.handledCount()`

Returns number of handled requests.

**Returns**:

`number`

---

---
id: requestlist
title: RequestList
---

<a name="RequestList"></a>

Represents a static list of URLs to crawl. The URLs can be provided either in code or parsed from a text file hosted on the web.

Each URL is represented using an instance of the [`Request`](request) class. The list can only contain unique URLs. More precisely, it can only
contain `Request` instances with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden. To
add a single URL to the list multiple times, corresponding [`Request`](request) objects will need to have different `uniqueKey` properties. You can
use the `keepDuplicateUrls` option to do this for you when initializing the `RequestList` from sources.

Once you create an instance of `RequestList`, you need to call the [`initialize`](#RequestList+initialize) function before the instance can be used.
After that, no more URLs can be added to the list.

`RequestList` is used by [`BasicCrawler`](basiccrawler), [`CheerioCrawler`](cheeriocrawler) and [`PuppeteerCrawler`](puppeteercrawler) as a source of
URLs to crawl. Unlike [`RequestQueue`](requestqueue), `RequestList` is static but it can contain even millions of URLs.

`RequestList` has an internal state where it stores information about which requests were already handled, which are in progress and which were
reclaimed. The state may be automatically persisted to the default [`KeyValueStore`](keyvaluestore) by setting the `persistStateKey` option so that if
the Node.js process is restarted, the crawling can continue where it left off. The automated persisting is launched upon receiving the `persistState`
event that is periodically emitted by [`Apify.events`](events).

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

-   [RequestList](requestlist)
    -   [`new exports.RequestList(options)`](#new_RequestList_new)
    -   [`.initialize()`](#RequestList+initialize) ⇒ `Promise<void>`
    -   [`.persistState()`](#RequestList+persistState) ⇒ `Promise<void>`
    -   [`.getState()`](#RequestList+getState) ⇒ [`RequestListState`](../typedefs/requestliststate)
    -   [`.isEmpty()`](#RequestList+isEmpty) ⇒ `Promise<Boolean>`
    -   [`.isFinished()`](#RequestList+isFinished) ⇒ `Promise<Boolean>`
    -   [`.fetchNextRequest()`](#RequestList+fetchNextRequest) ⇒ [`Promise<Request>`](request)
    -   [`.markRequestHandled(request)`](#RequestList+markRequestHandled) ⇒ `Promise<void>`
    -   [`.reclaimRequest(request)`](#RequestList+reclaimRequest) ⇒ `Promise<void>`
    -   [`.length()`](#RequestList+length) ⇒ `Number`
    -   [`.handledCount()`](#RequestList+handledCount) ⇒ `Number`

<a name="new_RequestList_new"></a>

## `new exports.RequestList(options)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/requestlistoptions">RequestListOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>RequestList</code> configuration options</p>
</td></tr></tbody>
</table>
<a name="RequestList+initialize"></a>

## `requestList.initialize()` ⇒ `Promise<void>`

Loads all remote sources of URLs and potentially starts periodic state persistence. This function must be called before you can start using the
instance in a meaningful way.

<a name="RequestList+persistState"></a>

## `requestList.persistState()` ⇒ `Promise<void>`

Persists the current state of the `RequestList` into the default [`KeyValueStore`](keyvaluestore). The state is persisted automatically in regular
intervals, but calling this method manually is useful in cases where you want to have the most current state available after you pause or stop
fetching its requests. For example after you pause or abort a crawl. Or just before a server migration.

<a name="RequestList+getState"></a>

## `requestList.getState()` ⇒ [`RequestListState`](../typedefs/requestliststate)

Returns an object representing the internal state of the `RequestList` instance. Note that the object's fields can change in future releases.

<a name="RequestList+isEmpty"></a>

## `requestList.isEmpty()` ⇒ `Promise<Boolean>`

Resolves to `true` if the next call to [`fetchNextRequest`](#RequestList+fetchNextRequest) function would return `null`, otherwise it resolves to
`false`. Note that even if the list is empty, there might be some pending requests currently being processed.

<a name="RequestList+isFinished"></a>

## `requestList.isFinished()` ⇒ `Promise<Boolean>`

Returns `true` if all requests were already handled and there are no more left.

<a name="RequestList+fetchNextRequest"></a>

## `requestList.fetchNextRequest()` ⇒ [`Promise<Request>`](request)

Gets the next [`Request`](request) to process. First, the function gets a request previously reclaimed using the
[`reclaimRequest`](#RequestList+reclaimRequest) function, if there is any. Otherwise it gets the next request from sources.

The function's `Promise` resolves to `null` if there are no more requests to process.

<a name="RequestList+markRequestHandled"></a>

## `requestList.markRequestHandled(request)` ⇒ `Promise<void>`

Marks request as handled after successful processing.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="RequestList+reclaimRequest"></a>

## `requestList.reclaimRequest(request)` ⇒ `Promise<void>`

Reclaims request to the list if its processing failed. The request will become available in the next `this.fetchNextRequest()`.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="RequestList+length"></a>

## `requestList.length()` ⇒ `Number`

Returns the total number of unique requests present in the `RequestList`.

<a name="RequestList+handledCount"></a>

## `requestList.handledCount()` ⇒ `Number`

Returns number of handled requests.

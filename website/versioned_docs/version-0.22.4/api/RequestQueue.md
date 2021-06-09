---
id: version-0.22.4-request-queue
title: RequestQueue
original_id: request-queue
---

<a name="requestqueue"></a>

Represents a queue of URLs to crawl, which is used for deep crawling of websites where you start with several URLs and then recursively follow links
to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each URL is represented using an instance of the [`Request`](../api/request) class. The queue can only contain unique URLs. More precisely, it can
only contain [`Request`](../api/request) instances with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can
also be overridden. To add a single URL multiple times to the queue, corresponding [`Request`](../api/request) objects will need to have different
`uniqueKey` properties.

Do not instantiate this class directly, use the [`Apify.openRequestQueue()`](../api/apify#openrequestqueue) function instead.

`RequestQueue` is used by [`BasicCrawler`](../api/basic-crawler), [`CheerioCrawler`](../api/cheerio-crawler) and
[`PuppeteerCrawler`](../api/puppeteer-crawler) as a source of URLs to crawl. Unlike [`RequestList`](../api/request-list), `RequestQueue` supports
dynamic adding and removing of requests. On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a
batch.

`RequestQueue` stores its data either on local disk or in the Apify Cloud, depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN`
environment variable is set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in that directory in an SQLite database file.

If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` is not, the data is stored in the
[Apify Request Queue](https://docs.apify.com/storage/request-queue) cloud storage. Note that you can force usage of the cloud storage also by passing
the `forceCloud` option to [`Apify.openRequestQueue()`](../api/apify#openrequestqueue) function, even if the `APIFY_LOCAL_STORAGE_DIR` variable is
set.

**Example usage:**

```javascript
// Open the default request queue associated with the actor run
const queue = await Apify.openRequestQueue();

// Open a named request queue
const queueWithName = await Apify.openRequestQueue('some-name');

// Enqueue few requests
await queue.addRequest({ url: 'http://example.com/aaa' });
await queue.addRequest({ url: 'http://example.com/bbb' });
await queue.addRequest({ url: 'http://example.com/foo/bar' }, { forefront: true });
```

---

<a name="addrequest"></a>

## `requestQueue.addRequest(requestLike, [options])`

Adds a request to the queue.

If a request with the same `uniqueKey` property is already present in the queue, it will not be updated. You can find out whether this happened from
the resulting [`QueueOperationInfo`](../typedefs/queue-operation-info) object.

To add multiple requests to the queue by extracting links from a webpage, see the [`utils.enqueueLinks()`](../api/utils#enqueuelinks) helper function.

**Parameters**:

-   **`requestLike`**: [`Request`](../api/request) | [`RequestOptions`](../typedefs/request-options) - [`Request`](../api/request) object or vanilla
    object with request data. Note that the function sets the `uniqueKey` and `id` fields to the passed Request.
-   **`[options]`**: `Object`
    -   **`[forefront]`**: `boolean` <code> = false</code> - If `true`, the request will be added to the foremost position in the queue.

**Returns**:

[`Promise<QueueOperationInfo>`](../typedefs/queue-operation-info)

---

<a name="getrequest"></a>

## `requestQueue.getRequest(id)`

Gets the request from the queue specified by ID.

**Parameters**:

-   **`id`**: `string` - ID of the request.

**Returns**:

[`Promise<(Request|null)>`](../api/request) - Returns the request object, or `null` if it was not found.

---

<a name="fetchnextrequest"></a>

## `requestQueue.fetchNextRequest()`

Returns a next request in the queue to be processed, or `null` if there are no more pending requests.

Once you successfully finish processing of the request, you need to call
[`RequestQueue.markRequestHandled()`](../api/request-queue#markrequesthandled) to mark the request as handled in the queue. If there was some error in
processing the request, call [`RequestQueue.reclaimRequest()`](../api/request-queue#reclaimrequest) instead, so that the queue will give the request
to some other consumer in another call to the `fetchNextRequest` function.

Note that the `null` return value doesn't mean the queue processing finished, it means there are currently no pending requests. To check whether all
requests in queue were finished, use [`RequestQueue.isFinished()`](../api/request-queue#isfinished) instead.

**Returns**:

[`Promise<(Request|null)>`](../api/request) - Returns the request object or `null` if there are no more pending requests.

---

<a name="markrequesthandled"></a>

## `requestQueue.markRequestHandled(request)`

Marks a request that was previously returned by the [`RequestQueue.fetchNextRequest()`](../api/request-queue#fetchnextrequest) function as handled
after successful processing. Handled requests will never again be returned by the `fetchNextRequest` function.

**Parameters**:

-   **`request`**: [`Request`](../api/request)

**Returns**:

[`Promise<QueueOperationInfo>`](../typedefs/queue-operation-info)

---

<a name="reclaimrequest"></a>

## `requestQueue.reclaimRequest(request, [options])`

Reclaims a failed request back to the queue, so that it can be returned for processed later again by another call to
[`RequestQueue.fetchNextRequest()`](../api/request-queue#fetchnextrequest). The request record in the queue is updated using the provided `request`
parameter. For example, this lets you store the number of retries or error messages for the request.

**Parameters**:

-   **`request`**: [`Request`](../api/request)
-   **`[options]`**: `Object` - **`[forefront]`**: `boolean` <code> = false</code> - If `true` then the request it placed to the beginning of the
    queue, so that it's returned in the next call to [`RequestQueue.fetchNextRequest()`](../api/request-queue#fetchnextrequest). By default, it's put
    to the end of the queue.

**Returns**:

[`Promise<QueueOperationInfo>`](../typedefs/queue-operation-info)

---

<a name="isempty"></a>

## `requestQueue.isEmpty()`

Resolves to `true` if the next call to [`RequestQueue.fetchNextRequest()`](../api/request-queue#fetchnextrequest) would return `null`, otherwise it
resolves to `false`. Note that even if the queue is empty, there might be some pending requests currently being processed. If you need to ensure that
there is no activity in the queue, use [`RequestQueue.isFinished()`](../api/request-queue#isfinished).

**Returns**:

`Promise<boolean>`

---

<a name="isfinished"></a>

## `requestQueue.isFinished()`

Resolves to `true` if all requests were already handled and there are no more left. Due to the nature of distributed storage used by the queue, the
function might occasionally return a false negative, but it will never return a false positive.

**Returns**:

`Promise<boolean>`

---

<a name="drop"></a>

## `requestQueue.drop()`

Removes the queue either from the Apify Cloud storage or from the local database, depending on the mode of operation.

**Returns**:

`Promise<void>`

---

<a name="handledcount"></a>

## `requestQueue.handledCount()`

Returns the number of handled requests.

This function is just a convenient shortcut for:

```javascript
const { handledRequestCount } = await queue.getInfo();
```

**Returns**:

`Promise<number>`

---

<a name="getinfo"></a>

## `requestQueue.getInfo()`

Returns an object containing general information about the request queue.

The function returns the same object as the Apify API Client's [getQueue](https://docs.apify.com/api/apify-client-js/latest#ApifyClient-requestQueues)
function, which in turn calls the [Get request queue](https://apify.com/docs/api/v2#/reference/request-queues/queue/get-request-queue) API endpoint.

**Example:**

```
{
  id: "WkzbQMuFYuamGv3YF",
  name: "my-queue",
  userId: "wRsJZtadYvn4mBZmm",
  createdAt: new Date("2015-12-12T07:34:14.202Z"),
  modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
  accessedAt: new Date("2015-12-14T08:36:13.202Z"),
  totalRequestCount: 25,
  handledRequestCount: 5,
  pendingRequestCount: 20,
}
```

**Returns**:

[`Promise<RequestQueueInfo>`](../typedefs/request-queue-info)

---

---
id: request-queue
title: RequestQueue
---

<a name="requestqueue"></a>

Represents a queue of URLs to crawl, which is used for deep crawling of websites where you start with several URLs and then recursively follow links
to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each URL is represented using an instance of the [`Request`](/docs/api/request) class. The queue can only contain unique URLs. More precisely, it can
only contain [`Request`](/docs/api/request) instances with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it
can also be overridden. To add a single URL multiple times to the queue, corresponding [`Request`](/docs/api/request) objects will need to have
different `uniqueKey` properties.

Do not instantiate this class directly, use the [`Apify.openRequestQueue()`](/docs/api/apify#openrequestqueue) function instead.

`RequestQueue` is used by [`BasicCrawler`](/docs/api/basic-crawler), [`CheerioCrawler`](/docs/api/cheerio-crawler) and
[`PuppeteerCrawler`](/docs/api/puppeteer-crawler) as a source of URLs to crawl. Unlike [`RequestList`](/docs/api/request-list), `RequestQueue`
supports dynamic adding and removing of requests. On the other hand, the queue is not optimized for operations that add or remove a large number of
URLs in a batch.

`RequestQueue` stores its data either on local disk or in the Apify Cloud, depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN`
environment variable is set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in that local directory as follows:

```
{APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/{STATE}/{NUMBER}.json
```

Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID: `default`, unless you override it by setting the
`APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable. Each request in the queue is stored as a separate JSON file, where `{STATE}` is either
`handled` or `pending`, and `{NUMBER}` is an integer indicating the position of the request in the queue.

If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
[Apify Request Queue](https://docs.apify.com/storage/request-queue) cloud storage. Note that you can force usage of the cloud storage also by passing
the `forceCloud` option to [`Apify.openRequestQueue()`](/docs/api/apify#openrequestqueue) function, even if the `APIFY_LOCAL_STORAGE_DIR` variable is
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

// Get requests from queue
const request1 = await queue.fetchNextRequest();
const request2 = await queue.fetchNextRequest();
const request3 = await queue.fetchNextRequest();

// Mark a request as handled
await queue.markRequestHandled(request1);

// If processing of a request fails then reclaim it back to the queue, so that it's crawled again
await queue.reclaimRequest(request2);
```

---

<a name="addrequest"></a>

## `requestQueue.addRequest(request, [options])`

**Returns**: [`Promise<QueueOperationInfo>`](/docs/typedefs/queue-operation-info)

Adds a request to the queue.

If a request with the same `uniqueKey` property is already present in the queue, it will not be updated. You can find out whether this happened from
the resulting [`QueueOperationInfo`](/docs/typedefs/queue-operation-info) object.

To add multiple requests to the queue by extracting links from a webpage, see the [`utils.enqueueLinks()`](/docs/api/utils#enqueuelinks) helper
function.

**Params**

-   **`request`**: [`Request`](/docs/api/request) | [`RequestOptions`](/docs/typedefs/request-options) - [`Request`](/docs/api/request) object or
    vanilla object with request data. Note that the function sets the `uniqueKey` and `id` fields to the passed object.
-   **`[options]`**: `Object`
    -   **`[.forefront]`**: `Boolean` <code> = false</code> - If `true`, the request will be added to the foremost position in the queue.

---

<a name="getrequest"></a>

## `requestQueue.getRequest(requestId)`

**Returns**: [`Promise<Request>`](/docs/api/request) - Returns the request object, or `null` if it was not found.

Gets the request from the queue specified by ID.

**Params**

-   **`requestId`**: `String` - ID of the request.

---

<a name="fetchnextrequest"></a>

## `requestQueue.fetchNextRequest()`

**Returns**: [`Promise<Request>`](/docs/api/request) - Returns the request object or `null` if there are no more pending requests.

Returns a next request in the queue to be processed, or `null` if there are no more pending requests.

Once you successfully finish processing of the request, you need to call
[`RequestQueue.markRequestHandled()`](/docs/api/request-queue#markrequesthandled) to mark the request as handled in the queue. If there was some error
in processing the request, call [`RequestQueue.reclaimRequest()`](/docs/api/request-queue#reclaimrequest) instead, so that the queue will give the
request to some other consumer in another call to the `fetchNextRequest` function.

Note that the `null` return value doesn't mean the queue processing finished, it means there are currently no pending requests. To check whether all
requests in queue were finished, use [`RequestQueue.isFinished()`](/docs/api/request-queue#isfinished) instead.

---

<a name="markrequesthandled"></a>

## `requestQueue.markRequestHandled(request)`

**Returns**: [`Promise<QueueOperationInfo>`](/docs/typedefs/queue-operation-info)

Marks a request that was previously returned by the [`RequestQueue.fetchNextRequest()`](/docs/api/request-queue#fetchnextrequest) function as handled
after successful processing. Handled requests will never again be returned by the `fetchNextRequest` function.

**Params**

-   **`request`**: [`Request`](/docs/api/request)

---

<a name="reclaimrequest"></a>

## `requestQueue.reclaimRequest(request, [options])`

**Returns**: [`Promise<QueueOperationInfo>`](/docs/typedefs/queue-operation-info)

Reclaims a failed request back to the queue, so that it can be returned for processed later again by another call to
[`RequestQueue.fetchNextRequest()`](/docs/api/request-queue#fetchnextrequest). The request record in the queue is updated using the provided `request`
parameter. For example, this lets you store the number of retries or error messages for the request.

**Params**

-   **`request`**: [`Request`](/docs/api/request)
-   **`[options]`**: `Object` - **`[.forefront]`**: `Boolean` <code> = false</code> - If `true` then the request it placed to the beginning of the
    queue, so that it's returned in the next call to [`RequestQueue.fetchNextRequest()`](/docs/api/request-queue#fetchnextrequest). By default, it's
    put to the end of the queue.

---

<a name="isempty"></a>

## `requestQueue.isEmpty()`

**Returns**: `Promise<Boolean>`

Resolves to `true` if the next call to [`RequestQueue.fetchNextRequest()`](/docs/api/request-queue#fetchnextrequest) would return `null`, otherwise it
resolves to `false`. Note that even if the queue is empty, there might be some pending requests currently being processed. If you need to ensure that
there is no activity in the queue, use [`RequestQueue.isFinished()`](/docs/api/request-queue#isfinished).

---

<a name="isfinished"></a>

## `requestQueue.isFinished()`

**Returns**: `Promise<Boolean>`

Resolves to `true` if all requests were already handled and there are no more left. Due to the nature of distributed storage used by the queue, the
function might occasionally return a false negative, but it will never return a false positive.

---

<a name="drop"></a>

## `requestQueue.drop()`

**Returns**: `Promise`

Removes the queue either from the Apify Cloud storage or from the local directory, depending on the mode of operation.

---

<a name="handledcount"></a>

## `requestQueue.handledCount()`

**Returns**: `Promise<number>`

Returns the number of handled requests.

This function is just a convenient shortcut for:

```javascript
const { handledRequestCount } = await queue.getInfo();
```

---

<a name="getinfo"></a>

## `requestQueue.getInfo()`

**Returns**: `Promise<Object>`

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

---

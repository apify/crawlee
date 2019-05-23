---
id: requestqueue
title: RequestQueue
---
<a name="RequestQueue"></a>

Represents a queue of URLs to crawl, which is used for deep crawling of websites
where you start with several URLs and then recursively
follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each URL is represented using an instance of the [`Request`](request) class.
The queue can only contain unique URLs. More precisely, it can only contain [`Request`](request) instances
with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
To add a single URL multiple times to the queue,
corresponding [`Request`](request) objects will need to have different `uniqueKey` properties.

Do not instantiate this class directly, use the
[`Apify.openRequestQueue()`](apify#module_Apify.openRequestQueue) function instead.

`RequestQueue` is used by [`BasicCrawler`](basiccrawler), [`CheerioCrawler`](cheeriocrawler)
and [`PuppeteerCrawler`](puppeteercrawler) as a source of URLs to crawl.
Unlike [`RequestList`](requestlist), `RequestQueue` supports dynamic adding and removing of requests.
On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.

`RequestQueue` stores its data either on local disk or in the Apify Cloud,
depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
that local directory as follows:
```
{APIFY_LOCAL_STORAGE_DIR}/request_queues/{QUEUE_ID}/{STATE}/{NUMBER}.json
```
Note that `{QUEUE_ID}` is the name or ID of the request queue. The default queue has ID: `default`,
unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable.
Each request in the queue is stored as a separate JSON file, where `{STATE}` is either `handled` or `pending`,
and `{NUMBER}` is an integer indicating the position of the request in the queue.

If the `APIFY_TOKEN` environment variable is set but `APIFY_LOCAL_STORAGE_DIR` not, the data is stored in the
<a href="https://apify.com/docs/storage#queue" target="_blank">Apify Request Queue</a>
cloud storage. Note that you can force usage of the cloud storage also by passing the `forceCloud`
option to [`Apify.openRequestQueue()`](apify#module_Apify.openRequestQueue) function,
even if the `APIFY_LOCAL_STORAGE_DIR` variable is set.

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


* [RequestQueue](requestqueue)
    * [`.addRequest(request, [options])`](#RequestQueue+addRequest) ⇒ [`QueueOperationInfo`](../typedefs/queueoperationinfo)
    * [`.getRequest(requestId)`](#RequestQueue+getRequest) ⇒ [`Promise<Request>`](request)
    * [`.fetchNextRequest()`](#RequestQueue+fetchNextRequest) ⇒ [`Promise<Request>`](request)
    * [`.markRequestHandled(request)`](#RequestQueue+markRequestHandled) ⇒ [`Promise<QueueOperationInfo>`](../typedefs/queueoperationinfo)
    * [`.reclaimRequest(request, [options])`](#RequestQueue+reclaimRequest) ⇒ [`Promise<QueueOperationInfo>`](../typedefs/queueoperationinfo)
    * [`.isEmpty()`](#RequestQueue+isEmpty) ⇒ `Promise<Boolean>`
    * [`.isFinished()`](#RequestQueue+isFinished) ⇒ `Promise<Boolean>`
    * [`.delete()`](#RequestQueue+delete) ⇒ `Promise`
    * [`.handledCount()`](#RequestQueue+handledCount) ⇒ `Promise<number>`
    * [`.getInfo()`](#RequestQueue+getInfo) ⇒ `Promise<Object>`

<a name="RequestQueue+addRequest"></a>

## `requestQueue.addRequest(request, [options])` ⇒ [`QueueOperationInfo`](../typedefs/queueoperationinfo)
Adds a request to the queue.

If a request with the same `uniqueKey` property is already present in the queue,
it will not be updated. You can find out whether this happened from the resulting
[`QueueOperationInfo`](../typedefs/queueoperationinfo) object.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code> | <code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p><a href="request"><code>Request</code></a> object, or an object to construct a <code>Request</code> instance from.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.forefront]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, the request will be added to the foremost position in the queue.</p>
</td></tr></tbody>
</table>
<a name="RequestQueue+getRequest"></a>

## `requestQueue.getRequest(requestId)` ⇒ [`Promise<Request>`](request)
Gets the request from the queue specified by ID.

**Returns**: [`Promise<Request>`](request) - Returns the request object, or `null` if it was not found.  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>requestId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Request ID</p>
</td></tr></tbody>
</table>
<a name="RequestQueue+fetchNextRequest"></a>

## `requestQueue.fetchNextRequest()` ⇒ [`Promise<Request>`](request)
Returns next request in the queue to be processed.

**Returns**: [`Promise<Request>`](request) - Returns the request object, or `null` if there are no more pending requests.  
<a name="RequestQueue+markRequestHandled"></a>

## `requestQueue.markRequestHandled(request)` ⇒ [`Promise<QueueOperationInfo>`](../typedefs/queueoperationinfo)
Marks request handled after successful processing.

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
<a name="RequestQueue+reclaimRequest"></a>

## `requestQueue.reclaimRequest(request, [options])` ⇒ [`Promise<QueueOperationInfo>`](../typedefs/queueoperationinfo)
Reclaims failed request back to the queue, so that it can be processed later again.
The request record in the queue is updated using the provided `request` parameter.
For example, this lets you store the number of retries for the request.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.forefront]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then requests get returned to the start of the queue
  and to the back of the queue otherwise.</p>
</td></tr></tbody>
</table>
<a name="RequestQueue+isEmpty"></a>

## `requestQueue.isEmpty()` ⇒ `Promise<Boolean>`
Resolves to `true` if the next call to [`fetchNextRequest`](#RequestQueue+fetchNextRequest) would return `null`, otherwise it resolves to `false`.
Note that even if the queue is empty, there might be some pending requests currently being processed.
If you need to ensure that there is no activity in the queue, use [`isFinished`](#RequestQueue+isFinished).

<a name="RequestQueue+isFinished"></a>

## `requestQueue.isFinished()` ⇒ `Promise<Boolean>`
Resolves to `true` if all requests were already handled and there are no more left.
Due to the nature of distributed storage systems,
the function might occasionally return a false negative, but it will never return a false positive.

<a name="RequestQueue+delete"></a>

## `requestQueue.delete()` ⇒ `Promise`
Removes the queue either from the Apify Cloud storage or from the local directory,
depending on the mode of operation.

<a name="RequestQueue+handledCount"></a>

## `requestQueue.handledCount()` ⇒ `Promise<number>`
Returns the number of handled requests.

<a name="RequestQueue+getInfo"></a>

## `requestQueue.getInfo()` ⇒ `Promise<Object>`
Returns an object containing general information about the request queue.

The function returns the same object as the Apify API Client's
[getQueue](https://apify.com/docs/api/apify-client-js/latest#ApifyClient-requestQueues-getQueue)
function, which in turn calls the
[Get request queue](https://apify.com/docs/api/v2#/reference/request-queues/queue/get-request-queue)
API endpoint.

**Example:**
```
{
  id: "WkzbQMuFYuamGv3YF",
  name: "my-queue",
  userId: "wRsJZtadYvn4mBZmm",
  createdAt: new Date("2015-12-12T07:34:14.202Z"),
  modifiedAt: new Date("2015-12-13T08:36:13.202Z"),
  accessedAt: new Date("2015-12-14T08:36:13.202Z"),
  totalRequestCount: 0,
  handledRequestCount: 0,
  pendingRequestCount: 0,
}
```


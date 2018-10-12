---
id: requestqueue
title: RequestQueue
---
<a name="RequestQueue"></a>

Represents a queue of URLs to crawl, which is used for deep crawling of websites
where you start with several URLs and then recursively
follow links to other pages. The data structure supports both breadth-first and depth-first crawling orders.

Each URL is represented using an instance of the [`Request`](request) class.
The queue can only contain unique URLs. More precisely, it can only contain `Request` instances
with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
To add a single URL multiple times to the queue,
corresponding `Request` objects will need to have different `uniqueKey` properties.

Do not instantiate this class directly, use the
[`Apify.openRequestQueue()`](apify#openrequestqueue) function instead.

`RequestQueue` is used by [`BasicCrawler`](basiccrawler), [`CheerioCrawler`](cheeriocrawler)
and [`PuppeteerCrawler`](puppeteercrawler) as a source of URLs to crawl.
Unlike [`RequestList`](requestlist), `RequestQueue` supports dynamic adding and removing of requests.
On the other hand, the queue is not optimized for operations that add or remove a large number of URLs in a batch.

`RequestQueue` stores its data either on local disk or in the Apify cloud,
depending on whether the `APIFY_LOCAL_STORAGE_DIR` or `APIFY_TOKEN` environment variable is set.

If the `APIFY_LOCAL_STORAGE_DIR` environment variable is set, the queue data is stored in
that local directory as follows:
```
[APIFY_LOCAL_STORAGE_DIR]/request_queues/[QUEUE_ID]/[STATE]/[NUMBER].json
```
Note that `[QUEUE_ID]` is the name or ID of the request queue. The default queue has ID `default`,
unless you override it by setting the `APIFY_DEFAULT_REQUEST_QUEUE_ID` environment variable.
Each request in the queue is stored as a separate JSON file, where `[STATE]` is either `handled` or `pending`,
and `[NUMBER]` is an integer indicating the position of the request in the queue.

If the `APIFY_TOKEN` environment variable is provided instead, the data is stored
in the [Apify Request Queue](https://www.apify.com/docs/storage#queue) cloud storage.

**Example usage:**

```javascript
// Open the default request queue associated with the actor run
const queue = await Apify.openRequestQueue();

// Open a named request queue
const queueWithName = await Apify.openRequestQueue('some-name');

// Enqueue few requests
await queue.addRequest(new Apify.Request({ url: 'http://example.com/aaa'}));
await queue.addRequest(new Apify.Request({ url: 'http://example.com/bbb'}));
await queue.addRequest(new Apify.Request({ url: 'http://example.com/foo/bar'}), { forefront: true });

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
    * [`.addRequest(request, [opts])`](requestqueue+addRequest) ⇒ [<code>RequestOperationInfo</code>](requestOperationInfo)
    * [`.getRequest(requestId)`](requestqueue+getRequest) ⇒ <code>Promise&lt;Request&gt;</code>
    * [`.fetchNextRequest()`](requestqueue+fetchNextRequest) ⇒ <code>Promise&lt;Request&gt;</code>
    * [`.markRequestHandled(request)`](requestqueue+markRequestHandled) ⇒ [<code>Promise&lt;RequestOperationInfo&gt;</code>](requestOperationInfo)
    * [`.reclaimRequest(request, [opts])`](requestqueue+reclaimRequest) ⇒ [<code>Promise&lt;RequestOperationInfo&gt;</code>](requestOperationInfo)
    * [`.isEmpty()`](requestqueue+isEmpty) ⇒ <code>Promise&lt;Boolean&gt;</code>
    * [`.isFinished()`](requestqueue+isFinished) ⇒ <code>Promise&lt;Boolean&gt;</code>
    * [`.delete()`](requestqueue+delete) ⇒ <code>Promise</code>

<a name="RequestQueue+addRequest"></a>

## `requestQueue.addRequest(request, [opts])` ⇒ [<code>RequestOperationInfo</code>](requestOperationInfo)
Adds a request to the queue.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code>Request</code></td>
</tr>
<tr>
<td colspan="3"><p>Request object</p>
</td></tr><tr>
<td><code>[opts]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[opts.forefront]</code></td><td><code>Boolean</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, the request will be added to the foremost position in the queue.</p>
</td></tr></tbody>
</table>
<a name="RequestQueue+getRequest"></a>

## `requestQueue.getRequest(requestId)` ⇒ <code>Promise&lt;Request&gt;</code>
Gets the request from the queue specified by ID.

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

## `requestQueue.fetchNextRequest()` ⇒ <code>Promise&lt;Request&gt;</code>
Returns next request in the queue to be processed.

<a name="RequestQueue+markRequestHandled"></a>

## `requestQueue.markRequestHandled(request)` ⇒ [<code>Promise&lt;RequestOperationInfo&gt;</code>](requestOperationInfo)
Marks request handled after successfull processing.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code>Request</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="RequestQueue+reclaimRequest"></a>

## `requestQueue.reclaimRequest(request, [opts])` ⇒ [<code>Promise&lt;RequestOperationInfo&gt;</code>](requestOperationInfo)
Reclaims failed request back to the queue,
so that it can be processed later again.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>request</code></td><td><code>Request</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[opts]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[opts.forefront]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If true then requests gets returned to the begining of the queue
  and to the back of the queue otherwise.</p>
</td></tr></tbody>
</table>
<a name="RequestQueue+isEmpty"></a>

## `requestQueue.isEmpty()` ⇒ <code>Promise&lt;Boolean&gt;</code>
Resolves to `true` if the next call to `fetchNextRequest()` will return `null`, otherwise it resolves to `false`.
Note that even if the queue is empty, there might be some pending requests currently being processed.

Due to the nature of distributed storage systems,
the function might occasionally return a false negative, but it should never return a false positive!

<a name="RequestQueue+isFinished"></a>

## `requestQueue.isFinished()` ⇒ <code>Promise&lt;Boolean&gt;</code>
Resolves to `true` if all requests were already handled and there are no more left.
Due to the nature of distributed storage systems,
the function might occasionally return a false negative, but it will never return a false positive.

<a name="RequestQueue+delete"></a>

## `requestQueue.delete()` ⇒ <code>Promise</code>
Removes the queue either from the Apify cloud storage or from the local directory,
depending on the mode of operation.


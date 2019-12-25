---
id: request
title: Request
---

<a name="Request"></a>

Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata. The `Request` object also stores information
about errors that occurred during processing of the request.

Each `Request` instance has the `uniqueKey` property, which can be either specified manually in the constructor or generated automatically from the
URL. Two requests with the same `uniqueKey` are considered as pointing to the same web resource. This behavior applies to all Apify SDK classes, such
as [`RequestList`](requestlist), [`RequestQueue`](requestqueue) or [`PuppeteerCrawler`](puppeteercrawler).

Example use:

```javascript
const request = new Apify.Request({
    url: 'http://www.example.com',
    headers: { Accept: 'application/json' },
});

...

request.userData.foo = 'bar';
request.pushErrorMessage(new Error('Request failed!'));

...

const foo = request.userData.foo;
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
<td><code>id</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Request ID</p>
</td></tr><tr>
<td><code>url</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>URL of the web page to crawl.</p>
</td></tr><tr>
<td><code>loadedUrl</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>An actually loaded URL after redirects, if present. HTTP redirects are guaranteed
  to be included.</p>
<p>  When using <a href="puppeteercrawler"><code>PuppeteerCrawler</code></a>, meta tag and JavaScript redirects may,
  or may not be included, depending on their nature. This generally means that redirects,
  which happen immediately will most likely be included, but delayed redirects will not.</p>
</td></tr><tr>
<td><code>uniqueKey</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>A unique key identifying the request.
  Two requests with the same <code>uniqueKey</code> are considered as pointing to the same URL.</p>
</td></tr><tr>
<td><code>method</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP method, e.g. <code>GET</code> or <code>POST</code>.</p>
</td></tr><tr>
<td><code>payload</code></td><td><code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP request payload, e.g. for POST requests.</p>
</td></tr><tr>
<td><code>noRetry</code></td><td><code>Boolean</code></td>
</tr>
<tr>
<td colspan="3"><p>The <code>true</code> value indicates that the request will not be automatically retried on error.</p>
</td></tr><tr>
<td><code>retryCount</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates the number of times the crawling of the request has been retried on error.</p>
</td></tr><tr>
<td><code>errorMessages</code></td><td><code>Array<String></code></td>
</tr>
<tr>
<td colspan="3"><p>An array of error messages from request processing.</p>
</td></tr><tr>
<td><code>headers</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object with HTTP headers. Key is header name, value is the value.</p>
</td></tr><tr>
<td><code>userData</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Custom user data assigned to the request.</p>
</td></tr><tr>
<td><code>handledAt</code></td><td><code>Date</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates the time when the request has been processed.
  Is <code>null</code> if the request has not been crawled yet.</p>
</td></tr></tbody>
</table>

-   [Request](request)
    -   [`new Request(options)`](#new_Request_new)
    -   [`.pushErrorMessage(errorOrMessage, [options])`](#Request+pushErrorMessage)

<a name="new_Request_new"></a>

## `new Request(options)`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/requestoptions">RequestOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p><code>Request</code> parameters including the URL, HTTP method and headers, and others.</p>
</td></tr></tbody>
</table>
<a name="Request+pushErrorMessage"></a>

## `request.pushErrorMessage(errorOrMessage, [options])`

Stores information about an error that occurred during processing of this request.

You should always use Error instances when throwing errors in JavaScript.

Nevertheless, to improve the debugging experience when using third party libraries that may not always throw an Error instance, the function performs
a type inspection of the passed argument and attempts to extract as much information as possible, since just throwing a bad type error makes any
debugging rather difficult.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>errorOrMessage</code></td><td><code>Error</code> | <code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Error object or error message to be stored in the request.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.omitStack]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>Only push the error message without stack trace when true.</p>
</td></tr></tbody>
</table>

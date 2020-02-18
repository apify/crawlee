---
id: utils
title: utils
---

<a name="utils"></a>

A namespace that contains various utilities.

**Example usage:**

```javascript
const Apify = require('apify');

...

// Sleep 1.5 seconds
await Apify.utils.sleep(1500);
```

-   [`utils`](#utils) : `object`
    -   [`.enqueueLinks`](#utils.enqueueLinks) ⇒ `Promise<Array<QueueOperationInfo>>`
    -   [`.requestAsBrowser`](#utils.requestAsBrowser) ⇒ `Promise<(http.IncomingMessage|stream.Readable)>`
    -   [`.sleep`](#utils.sleep) ⇒ `Promise<void>`
    -   [`.URL_NO_COMMAS_REGEX`](#utils.URL_NO_COMMAS_REGEX)
    -   [`.URL_WITH_COMMAS_REGEX`](#utils.URL_WITH_COMMAS_REGEX)
    -   [`.isDocker(forceReset)`](#utils.isDocker) ⇒ `Promise<boolean>`
    -   [`.downloadListOfUrls(options)`](#utils.downloadListOfUrls) ⇒ `Promise<Array<String>>`
    -   [`.extractUrls(options)`](#utils.extractUrls) ⇒ `Array<String>`
    -   [`.getRandomUserAgent()`](#utils.getRandomUserAgent) ⇒ `String`
    -   [`.htmlToText(html)`](#utils.htmlToText) ⇒ `String`
        -   [`~$`](#utils.htmlToText..$) : `Cheerio`

<a name="utils.enqueueLinks"></a>

## `utils.enqueueLinks` ⇒ `Promise<Array<QueueOperationInfo>>`

The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default) either in a Puppeteer page, or in a Cheerio object
(parsed HTML), and enqueues the URLs in their `href` attributes to the provided [`RequestQueue`](requestqueue). If you're looking to find URLs in
JavaScript heavy pages where links are not available in `href` elements, but rather navigations are triggered in click handlers see
[`enqueueLinksByClickingElements()`](puppeteer#puppeteer.enqueueLinksByClickingElements).

Optionally, the function allows you to filter the target links' URLs using an array of [`PseudoUrl`](pseudourl) objects and override settings of the
enqueued [`Request`](request) objects.

**Example usage**

```javascript
const Apify = require('apify');

const browser = await Apify.launchPuppeteer();
const page = await browser.goto('https://www.example.com');
const requestQueue = await Apify.openRequestQueue();

await Apify.utils.enqueueLinks({
    page,
    requestQueue,
    selector: 'a.product-detail',
    pseudoUrls: ['https://www.example.com/handbags/[.*]', 'https://www.example.com/purses/[.*]'],
});
```

**Returns**: `Promise<Array<QueueOperationInfo>>` - Promise that resolves to an array of [`QueueOperationInfo`](../typedefs/queueoperationinfo)
objects.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>All <code>enqueueLinks()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>options.page</code></td><td><code>Page</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.
  Either <code>page</code> or <code>$</code> option must be provided.</p>
</td></tr><tr>
<td><code>options.$</code></td><td><code>Cheerio</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p><a href="https://github.com/cheeriojs/cheerio" target="_blank"><code>Cheerio</code></a> object with loaded HTML.
  Either <code>page</code> or <code>$</code> option must be provided.</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A request queue to which the URLs will be enqueued.</p>
</td></tr><tr>
<td><code>[options.selector]</code></td><td><code>String</code></td><td><code>&#x27;a&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>A CSS selector matching links to be enqueued.</p>
</td></tr><tr>
<td><code>[options.baseUrl]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
  since the relative URL resolution is done inside the browser automatically.</p>
</td></tr><tr>
<td><code>[options.pseudoUrls]</code></td><td><code>Array<Object&gt;</code> | <code>Array.&lt;String></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of <a href="pseudourl"><code>PseudoUrl</code></a>s matching the URLs to be enqueued,
  or an array of strings or RegExps or plain Objects from which the <a href="pseudourl"><code>PseudoUrl</code></a>s can be constructed.</p>
<p>  The plain objects must include at least the <code>purl</code> property, which holds the pseudo-URL string or RegExp.
  All remaining keys will be used as the <code>requestTemplate</code> argument of the <a href="pseudourl"><code>PseudoUrl</code></a> constructor,
  which lets you specify special properties for the enqueued <a href="request"><code>Request</code></a> objects.</p>
<p>  If <code>pseudoUrls</code> is an empty array, <code>null</code> or <code>undefined</code>, then the function
  enqueues all links found on the page.</p>
</td></tr><tr>
<td><code>[options.transformRequestFunction]</code></td><td><code><a href="../typedefs/requesttransform">RequestTransform</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Just before a new <a href="request"><code>Request</code></a> is constructed and enqueued to the <a href="requestqueue"><code>RequestQueue</code></a>, this function can be used
  to remove it or modify its contents such as <code>userData</code>, <code>payload</code> or, most importantly <code>uniqueKey</code>. This is useful
  when you need to enqueue multiple <code>Requests</code> to the queue that share the same URL, but differ in methods or payloads,
  or to dynamically update or create <code>userData</code>.</p>
<p>  For example: by adding <code>keepUrlFragment: true</code> to the <code>request</code> object, URL fragments will not be removed
  when <code>uniqueKey</code> is computed.</p>
<p>  <strong>Example:</strong></p>
<pre><code class="language-javascript">  {
      transformRequestFunction: (request) =&gt; {
          request.userData.foo = &#39;bar&#39;;
          request.keepUrlFragment = true;
          return request;
      }
  }</code></pre>
</td></tr></tbody>
</table>
<a name="utils.requestAsBrowser"></a>

## `utils.requestAsBrowser` ⇒ `Promise<(http.IncomingMessage|stream.Readable)>`

**IMPORTANT:** This function uses an insecure version of HTTP parser by default and also ignores SSL/TLS errors. This is very useful in scraping,
because it allows bypassing certain anti-scraping walls, but it also exposes some vulnerability. For other than scraping scenarios, please set
`useInsecureHttpParser: false` and `ignoreSslErrors: false`.

Sends an HTTP request that looks like a request sent by a web browser, fully emulating browser's HTTP headers.

This function is useful for web scraping of websites that send the full HTML in the first response. Thanks to this function, the target web server has
no simple way to find out the request hasn't been sent by a full web browser. Using a headless browser for such requests is an order of magnitude more
resource-intensive than this function. By default tt aborts all requests that returns 406 status codes or non-HTML content-types. You can override
this behavior by passing custom `abortFunction`.

Currently, the function sends requests the same way as Firefox web browser does. In the future, it might add support for other browsers too.

Internally, the function uses httpRequest function from the [@apify/httpRequest](https://github.com/apifytech/http-request) NPM package to perform the
request. All `options` not recognized by this function are passed to it, so see it for more details.

**Returns**: `Promise<(http.IncomingMessage|stream.Readable)>` - This will typically be a
[Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage), however, if returned from the cache it will be a
[response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code><a href="../typedefs/requestasbrowseroptions">RequestAsBrowserOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>All <code>requestAsBrowser</code> configuration options.</p>
</td></tr></tbody>
</table>
<a name="utils.sleep"></a>

## `utils.sleep` ⇒ `Promise<void>`

Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting in your code, e.g. to prevent overloading of
target website or to avoid bot detection.

**Example usage:**

```
const Apify = require('apify');

...

// Sleep 1.5 seconds
await Apify.utils.sleep(1500);
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>millis</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.</p>
</td></tr></tbody>
</table>
<a name="utils.URL_NO_COMMAS_REGEX"></a>

## `utils.URL_NO_COMMAS_REGEX`

Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters and does not
support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).

<a name="utils.URL_WITH_COMMAS_REGEX"></a>

## `utils.URL_WITH_COMMAS_REGEX`

Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query. Note,
however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.

<a name="utils.isDocker"></a>

## `utils.isDocker(forceReset)` ⇒ `Promise<boolean>`

Returns a `Promise` that resolves to true if the code is running in a Docker container.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>forceReset</code></td><td><code>boolean</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="utils.downloadListOfUrls"></a>

## `utils.downloadListOfUrls(options)` ⇒ `Promise<Array<String>>`

Returns a promise that resolves to an array of urls parsed from the resource available at the provided url. Optionally, custom regular expression and
encoding may be provided.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>options.url</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL to the file</p>
</td></tr><tr>
<td><code>[options.encoding]</code></td><td><code>String</code></td><td><code>&#x27;utf8&#x27;</code></td>
</tr>
<tr>
<td colspan="3"><p>The encoding of the file.</p>
</td></tr><tr>
<td><code>[options.urlRegExp]</code></td><td><code>RegExp</code></td><td><code>URL_NO_COMMAS_REGEX</code></td>
</tr>
<tr>
<td colspan="3"><p>Custom regular expression to identify the URLs in the file to extract.
  The regular expression should be case-insensitive and have global flag set (i.e. <code>/something/gi</code>).</p>
</td></tr></tbody>
</table>
<a name="utils.extractUrls"></a>

## `utils.extractUrls(options)` ⇒ `Array<String>`

Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
</tr><tr>
<td><code>options.string</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
</tr><tr>
<td><code>[options.urlRegExp]</code></td><td><code>RegExp</code></td><td><code>Apify.utils.URL_NO_COMMAS_REGEX</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="utils.getRandomUserAgent"></a>

## `utils.getRandomUserAgent()` ⇒ `String`

Returns a randomly selected User-Agent header out of a list of the most common headers.

<a name="utils.htmlToText"></a>

## `utils.htmlToText(html)` ⇒ `String`

The function converts a HTML document to a plain text.

The plain text generated by the function is similar to a text captured by pressing Ctrl+A and Ctrl+C on a page when loaded in a web browser. The
function doesn't aspire to preserve the formatting or to be perfectly correct with respect to HTML specifications. However, it attempts to generate
newlines and whitespaces in and around HTML elements to avoid merging distinct parts of text and thus enable extraction of data from the text (e.g.
phone numbers).

**Example usage**

```javascript
const text = htmlToText('<html><body>Some text</body></html>');
console.log(text);
```

Note that the function uses [cheerio](https://www.npmjs.com/package/cheerio) to parse the HTML. Optionally, to avoid duplicate parsing of HTML and
thus improve performance, you can pass an existing Cheerio object to the function instead of the HTML text. The HTML should be parsed with the
`decodeEntities` option set to `true`. For example:

```javascript
const cheerio = require('cheerio');
const html = '<html><body>Some text</body></html>';
const text = htmlToText(cheerio.load(html, { decodeEntities: true }));
```

**Returns**: `String` - Plain text

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>html</code></td><td><code>String</code> | <code>Cheerio</code></td>
</tr>
<tr>
<td colspan="3"><p>HTML text or parsed HTML represented using a
<a href="https://www.npmjs.com/package/cheerio">cheerio</a> function.</p>
</td></tr></tbody>
</table>
<a name="utils.htmlToText..$"></a>

### `htmlToText~$` : `Cheerio`

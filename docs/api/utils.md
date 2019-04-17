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


* [`utils`](#utils) : <code>object</code>
    * [`.enqueueLinks`](#utils.enqueueLinks) ⇒ <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code>
    * [`.requestExtended`](#utils.requestExtended) ⇒ <code>http.IncomingMessage</code>
    * [`.requestLikeBrowser`](#utils.requestLikeBrowser) ⇒ <code>http.IncomingMessage</code>
    * [`.sleep`](#utils.sleep) ⇒ <code>Promise</code>
    * [`.URL_NO_COMMAS_REGEX`](#utils.URL_NO_COMMAS_REGEX)
    * [`.URL_WITH_COMMAS_REGEX`](#utils.URL_WITH_COMMAS_REGEX)
    * [`.isDocker()`](#utils.isDocker) ⇒ <code>Promise</code>
    * [`.downloadListOfUrls(options)`](#utils.downloadListOfUrls) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.extractUrls(string, [urlRegExp])`](#utils.extractUrls) ⇒ <code>Array&lt;String&gt;</code>
    * [`.getRandomUserAgent()`](#utils.getRandomUserAgent) ⇒ <code>String</code>
    * [`.htmlToText(html)`](#utils.htmlToText) ⇒ <code>String</code>

<a name="utils.enqueueLinks"></a>

## `utils.enqueueLinks` ⇒ <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code>
The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default)
either in a Puppeteer page, or in a Cheerio object (parsed HTML),
and enqueues the corresponding links to the provided [`RequestQueue`](requestqueue).
Optionally, the function allows you to filter the target links' URLs using an array of [`PseudoUrl`](pseudourl) objects
and override settings of the enqueued [`Request`](request) objects.

*IMPORTANT*: This is a work in progress. Currently the function only supports elements with
`href` attribute pointing to a URL. However, in the future the function will also support
JavaScript links, buttons and form submissions when used with a Puppeteer Page.

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
  pseudoUrls: [
      'https://www.example.com/handbags/[.*]'
      'https://www.example.com/purses/[.*]'
  ],
});
```

**Returns**: <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code> - Promise that resolves to an array of [`QueueOperationInfo`](../typedefs/queueoperationinfo) objects.  
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
<td><code>[options.pseudoUrls]</code></td><td><code>Array&lt;Object&gt;</code> | <code>Array&lt;String&gt;</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An array of <a href="pseudourl"><code>PseudoUrl</code></a>s matching the URLs to be enqueued,
  or an array of strings or RegExps or plain Objects from which the <a href="pseudourl"><code>PseudoUrl</code></a>s can be constructed.</p>
<p>  The plain objects must include at least the <code>purl</code> property, which holds the pseudo-URL string or RegExp.
  All remaining keys will be used as the <code>requestTemplate</code> argument of the <a href="pseudourl"><code>PseudoUrl</code></a> constructor.
  which lets you specify special properties for the enqueued <a href="request"><code>Request</code></a> objects.</p>
<p>  If <code>pseudoUrls</code> is an empty array, <code>null</code> or <code>undefined</code>, then the function
  enqueues all links found on the page.</p>
</td></tr><tr>
<td><code>[options.userData]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An object that will be merged with the new <a href="request"><code>Request</code></a>&#39;s <code>userData</code>, overriding any values that
  were set via templating from <code>pseudoUrls</code>. This is useful when you need to override generic
  <code>userData</code> set by the <a href="pseudourl"><code>PseudoUrl</code></a> template in specific use cases.</p>
<p>  <strong>Example:</strong></p>
<pre><code>// pseudoUrl.userData
{
    name: &#39;John&#39;,
    surname: &#39;Doe&#39;,
}
</code></pre><pre><code>// userData
{
    name: &#39;Albert&#39;,
    age: 31
}
</code></pre><pre><code>// Enqueued request.userData
{
    name: &#39;Albert&#39;,
    surname: &#39;Doe&#39;,
    age: 31,
}
</code></pre></td></tr></tbody>
</table>
<a name="utils.requestExtended"></a>

## `utils.requestExtended` ⇒ <code>http.IncomingMessage</code>
Sends a HTTP request and returns the response.
The function has similar functionality and options as the [request](https://www.npmjs.com/package/request) NPM package,
but it brings several additional improvements and fixes:

- It support not only Gzip compression, but also Brotli and Deflate. To activate this feature,
  simply add `Accept-Encoding: gzip, deflate, br` to `options.headers` (or a combination).
- Enables abortion of the request based on the response headers, before the data is downloaded.
  See `options.abortFunction` parameter.
- SSL connections over proxy do not leak sockets in CLOSE_WAIT state (https://github.com/request/request/issues/2440)
- Gzip implementation doesn't fail (https://github.com/apifytech/apify-js/issues/266)
- There is no tunnel-agent AssertionError (https://github.com/request/tunnel-agent/issues/20)

NOTE: Most of the options below are simply copied from NPM request. Perhaps we don't need to copy
them here and can just pass them down. Well, we can decide later.

<table>
<thead>
<tr>
<th>Param</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options.url</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL of the target endpoint. Supports both HTTP and HTTPS schemes.</p>
</td></tr><tr>
<td><code>[options.method]</code></td><td><code>GET</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP method.</p>
</td></tr><tr>
<td><code>[options.headers=]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>HTTP headers.
 Note that the function generates several headers itself, unless
 they are defined in the <code>headers</code> parameter, in which case the function leaves them untouched.
 For example, even if you define <code>{ &#39;Content-Length&#39;: null }</code>, the function doesn&#39;t define
 the &#39;Content-Length&#39; header and the request will not contain it (due to the <code>null</code> value).</p>
</td></tr><tr>
<td><code>[options.body]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>HTTP payload for PATCH, POST and PUT requests. Must be a <code>Buffer</code> or <code>String</code>.</p>
</td></tr><tr>
<td><code>[options.followRedirect]</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>Follow HTTP 3xx responses as redirects (default: true).
 OPTIONALLY: This property can also be implemented as function which gets response object as
 a single argument and should return <code>true</code> if redirects should continue or <code>false</code> otherwise.</p>
</td></tr><tr>
<td><code>[options.maxRedirects]</code></td><td><code>10</code></td>
</tr>
<tr>
<td colspan="3"><p>The maximum number of redirects to follow.</p>
</td></tr><tr>
<td><code>[options.removeRefererHeader]</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>Removes the referer header when a redirect happens.
 If <code>true</code>, referer header set in the initial request is preserved during redirect chain.</p>
</td></tr><tr>
<td><code>[options.encoding]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Encoding to be used on <code>setEncoding</code> of response data.
 If <code>null</code>, the body is returned as a <code>Buffer</code>.
 Anything else (including the default value of undefined) will be passed as the encoding parameter to <code>toString()</code>,
 (meaning this is effectively utf8 by default).
 (Note: if you expect binary data, you should set encoding: null.)</p>
</td></tr><tr>
<td><code>[options.gzip]</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, the function adds an <code>Accept-Encoding: gzip</code> header to request compressed content encodings from the server
 (if not already present) and decode supported content encodings in the response.
 Note that you can achieve the same effect by adding the <code>Accept-Encoding: gzip</code> header directly to <code>options.headers</code>,
 similarly as <code>deflate</code> as <code>br</code> encodings.</p>
</td></tr><tr>
<td><code>[options.json]</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>Sets body to JSON representation of value and adds <code>Content-type: application/json</code> header.
 Additionally, parses the response body as JSON, i.e. the <code>body</code> property of the returned object
 is the result of <code>JSON.parse()</code>. Throws an error if response cannot be parsed as JSON.</p>
</td></tr><tr>
<td><code>[options.timeout]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Integer containing the number of milliseconds to wait for a server to send
 response headers (and start the response body) before aborting the request.
 Note that if the underlying TCP connection cannot be established, the OS-wide
 TCP connection timeout will overrule the timeout option (the default in Linux can be anywhere from 20-120 seconds).</p>
</td></tr><tr>
<td><code>[options.proxy]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An HTTP proxy to be used. Supports proxy authentication with Basic Auth.</p>
</td></tr><tr>
<td><code>[options.strictSSL]</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, requires SSL/TLS certificates to be valid.</p>
</td></tr><tr>
<td><code>[options.abortFunction]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A function that determines whether the request should be aborted. It is called when the server
 responds with the HTTP headers, but before the actual data is downloaded.
 The function receives a single argument - an instance of Node&#39;s
 <a href="https://nodejs.org/api/http.html#http_class_http_incomingmessage"><code>http.IncomingMessage</code></a>
 class and it should return <code>true</code> if request should be aborted, or <code>false</code> otherwise.</p>
</td></tr><tr>
<td><code>[options.throwOnHttpError]</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true function throws and error on 4XX and 5XX response codes.</p>
</td></tr></tbody>
</table>
<a name="utils.requestLikeBrowser"></a>

## `utils.requestLikeBrowser` ⇒ <code>http.IncomingMessage</code>
Sends a HTTP request that looks like a request sent by a web browser,
fully emulating browser's HTTP headers.

This function is useful for web scraping of websites that send the full HTML in the first response.
Thanks to this function, the target web server has no simple way to find out the request
hasn't been sent by a full web browser. Using a headless browser for such requests
is an order of magnitude more resource-intensive than this function.

Currently, the function sends requests the same way as Firefox web browser does.
In the future, it might add support for other browsers too.

Internally, the function uses `requestBetter()` function to perform the request.
All `options` not recognized by this function are passed to it,
so see it for more details.

<table>
<thead>
<tr>
<th>Param</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options.url</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL of the target endpoint. Supports both HTTP and HTTPS schemes.</p>
</td></tr><tr>
<td><code>[options.method]</code></td><td><code>GET</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP method.</p>
</td></tr><tr>
<td><code>[options.headers]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Additional HTTP headers to add. It&#39;s only recommended to use this option,
 with headers that are typically added by websites, such as cookies. Overriding
 default browser headers will remove the masking this function provides.</p>
</td></tr><tr>
<td><code>[options.languageCode]</code></td><td><code>en</code></td>
</tr>
<tr>
<td colspan="3"><p>Two-letter ISO 639 language code.</p>
</td></tr><tr>
<td><code>[options.countryCode]</code></td><td><code>US</code></td>
</tr>
<tr>
<td colspan="3"><p>Two-letter ISO 3166 country code.</p>
</td></tr><tr>
<td><code>[options.isMobile]</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, the function uses User-Agent of a mobile browser.</p>
</td></tr></tbody>
</table>
<a name="utils.sleep"></a>

## `utils.sleep` ⇒ <code>Promise</code>
Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
in your code, e.g. to prevent overloading of target website or to avoid bot detection.

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
Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).

<a name="utils.URL_WITH_COMMAS_REGEX"></a>

## `utils.URL_WITH_COMMAS_REGEX`
Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.

<a name="utils.isDocker"></a>

## `utils.isDocker()` ⇒ <code>Promise</code>
Returns a `Promise` that resolves to true if the code is running in a Docker container.

<a name="utils.downloadListOfUrls"></a>

## `utils.downloadListOfUrls(options)` ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
Optionally, custom regular expression and encoding may be provided.

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

## `utils.extractUrls(string, [urlRegExp])` ⇒ <code>Array&lt;String&gt;</code>
Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>string</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
</tr><tr>
<td><code>[urlRegExp]</code></td><td><code>RegExp</code></td><td><code>Apify.utils.URL_NO_COMMAS_REGEX</code></td>
</tr>
<tr>
</tr></tbody>
</table>
<a name="utils.getRandomUserAgent"></a>

## `utils.getRandomUserAgent()` ⇒ <code>String</code>
Returns a randomly selected User-Agent header out of a list of the most common headers.

<a name="utils.htmlToText"></a>

## `utils.htmlToText(html)` ⇒ <code>String</code>
The function converts a HTML document to a plain text.

The plain text generated by the function is similar to a text captured
by pressing Ctrl+A and Ctrl+C on a page when loaded in a web browser.
The function doesn't aspire to preserve the formatting or to be perfectly correct with respect to HTML specifications.
However, it attempts to generate newlines and whitespaces in and around HTML elements
to avoid merging distinct parts of text and thus enable extraction of data from the text (e.g. phone numbers).

**Example usage**
```javascript
const text = htmlToText('<html><body>Some text</body></html>');
console.log(text);
```

Note that the function uses [cheerio](https://www.npmjs.com/package/cheerio) to parse the HTML.
Optionally, to avoid duplicate parsing of HTML and thus improve performance, you can pass
an existing Cheerio object to the function instead of the HTML text. The HTML should be parsed
with the `decodeEntities` option set to `true`. For example:

```javascript
const cheerio = require('cheerio');
const html = '<html><body>Some text</body></html>';
const text = htmlToText(cheerio.load(html, { decodeEntities: true }));
```

**Returns**: <code>String</code> - Plain text  
<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>html</code></td><td><code>String</code> | <code>function</code></td>
</tr>
<tr>
<td colspan="3"><p>HTML text or parsed HTML represented using a
<a href="https://www.npmjs.com/package/cheerio">cheerio</a> function.</p>
</td></tr></tbody>
</table>

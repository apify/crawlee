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


* [`utils`](#utils) : `object`
    * [`.enqueueLinks`](#utils.enqueueLinks) ⇒ `Promise<Array<QueueOperationInfo>>`
    * [`.sleep`](#utils.sleep) ⇒ `Promise`
    * [`.URL_NO_COMMAS_REGEX`](#utils.URL_NO_COMMAS_REGEX)
    * [`.URL_WITH_COMMAS_REGEX`](#utils.URL_WITH_COMMAS_REGEX)
    * [`.isDocker()`](#utils.isDocker) ⇒ `Promise`
    * [`.downloadListOfUrls(options)`](#utils.downloadListOfUrls) ⇒ `Promise<Array<String>>`
    * [`.extractUrls(options)`](#utils.extractUrls) ⇒ `Array<String>`
    * [`.getRandomUserAgent()`](#utils.getRandomUserAgent) ⇒ `String`
    * [`.htmlToText(html)`](#utils.htmlToText) ⇒ `String`

<a name="utils.enqueueLinks"></a>

## `utils.enqueueLinks` ⇒ `Promise<Array<QueueOperationInfo>>`
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

**Returns**: `Promise<Array<QueueOperationInfo>>` - Promise that resolves to an array of [`QueueOperationInfo`](../typedefs/queueoperationinfo) objects.  
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
}</code></pre><pre><code>// userData
{
    name: &#39;Albert&#39;,
    age: 31
}</code></pre><pre><code>// Enqueued request.userData
{
    name: &#39;Albert&#39;,
    surname: &#39;Doe&#39;,
    age: 31,
}</code></pre></td></tr></tbody>
</table>
<a name="utils.sleep"></a>

## `utils.sleep` ⇒ `Promise`
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

## `utils.isDocker()` ⇒ `Promise`
Returns a `Promise` that resolves to true if the code is running in a Docker container.

<a name="utils.downloadListOfUrls"></a>

## `utils.downloadListOfUrls(options)` ⇒ `Promise<Array<String>>`
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

**Returns**: `String` - Plain text  
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

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
    * [`.URL_NO_COMMAS_REGEX`](#utils.URL_NO_COMMAS_REGEX)
    * [`.URL_WITH_COMMAS_REGEX`](#utils.URL_WITH_COMMAS_REGEX)
    * [`.sleep(millis)`](#utils.sleep) ⇒ <code>Promise</code>
    * [`.downloadListOfUrls(options)`](#utils.downloadListOfUrls) ⇒ <code>Promise&lt;Array&lt;String&gt;&gt;</code>
    * [`.extractUrls(string, [urlRegExp])`](#utils.extractUrls) ⇒ <code>Array&lt;String&gt;</code>
    * [`.getRandomUserAgent()`](#utils.getRandomUserAgent) ⇒ <code>String</code>

<a name="utils.URL_NO_COMMAS_REGEX"></a>

## `utils.URL\_NO\_COMMAS\_REGEX`
Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).

<a name="utils.URL_WITH_COMMAS_REGEX"></a>

## `utils.URL\_WITH\_COMMAS\_REGEX`
Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.

<a name="utils.sleep"></a>

## `utils.sleep(millis)` ⇒ <code>Promise</code>
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


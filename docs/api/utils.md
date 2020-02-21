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

---

<a name="url_no_commas_regex"></a>

## `utils.URL_NO_COMMAS_REGEX`

Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters and does not
support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).

---

<a name="url_with_commas_regex"></a>

## `utils.URL_WITH_COMMAS_REGEX`

Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query. Note,
however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.

---

<a name="enqueuelinks"></a>

## `utils.enqueueLinks(options)`

**Returns**: [`Promise<Array<QueueOperationInfo>>`](/docs/typedefs/queue-operation-info) - Promise that resolves to an array of
[`QueueOperationInfo`](/docs/typedefs/queue-operation-info) objects.

The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default) either in a Puppeteer page, or in a Cheerio object
(parsed HTML), and enqueues the URLs in their `href` attributes to the provided [`RequestQueue`](/docs/api/request-queue). If you're looking to find
URLs in JavaScript heavy pages where links are not available in `href` elements, but rather navigations are triggered in click handlers see
[`puppeteer.enqueueLinksByClickingElements()`](/docs/api/puppeteer#enqueuelinksbyclickingelements).

Optionally, the function allows you to filter the target links' URLs using an array of [`PseudoUrl`](/docs/api/pseudo-url) objects and override
settings of the enqueued [`Request`](/docs/api/request) objects.

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

**Params**

-   **`options`**: `Object` - All `enqueueLinks()` parameters are passed via an options object with the following keys:

    -   **`.page`**: `Page` - Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object. Either `page` or `$` option must be
        provided.
    -   **`.$`**: `Cheerio` - [`Cheerio`](https://github.com/cheeriojs/cheerio) function with loaded HTML. Either `page` or `$` option must be
        provided.
    -   **`.requestQueue`**: [`RequestQueue`](/docs/api/request-queue) - A request queue to which the URLs will be enqueued.
    -   **`[.selector]`**: `String` <code> = &#x27;a&#x27;</code> - A CSS selector matching links to be enqueued.
    -   **`[.baseUrl]`**: `string` - A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer, since the
        relative URL resolution is done inside the browser automatically.
    -   **`[.pseudoUrls]`**: `Array<Object&gt;` | `Array.&lt;String>` - An array of [`PseudoUrl`](/docs/api/pseudo-url)s matching the URLs to be
        enqueued, or an array of strings or RegExps or plain Objects from which the [`PseudoUrl`](/docs/api/pseudo-url)s can be constructed.

    The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp. All remaining keys will be used as the
    `requestTemplate` argument of the [`PseudoUrl`](/docs/api/pseudo-url) constructor, which lets you specify special properties for the enqueued
    [`Request`](/docs/api/request) objects.

    If `pseudoUrls` is an empty array, `null` or `undefined`, then the function enqueues all links found on the page.

    -   **`[.transformRequestFunction]`**: [`RequestTransform`](/docs/typedefs/request-transform) - Just before a new [`Request`](/docs/api/request)
        is constructed and enqueued to the [`RequestQueue`](/docs/api/request-queue), this function can be used to remove it or modify its contents
        such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful when you need to enqueue multiple `Requests` to the queue that
        share the same URL, but differ in methods or payloads, or to dynamically update or create `userData`.

    For example: by adding `keepUrlFragment: true` to the `request` object, URL fragments will not be removed when `uniqueKey` is computed.

    **Example:**

    ```javascript
    {
        transformRequestFunction: request => {
            request.userData.foo = 'bar';
            request.keepUrlFragment = true;
            return request;
        };
    }
    ```

---

<a name="requestasbrowser"></a>

## `utils.requestAsBrowser(options)`

**Returns**: `Promise<(http.IncomingMessage|stream.Readable)>` - This will typically be a
[Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage), however, if returned from the cache it will be a
[response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.

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

**Params**

-   **`options`**: [`RequestAsBrowserOptions`](/docs/typedefs/request-as-browser-options) - All `requestAsBrowser` configuration options.

---

<a name="isdocker"></a>

## `utils.isDocker(forceReset)`

**Returns**: `Promise<boolean>`

Returns a `Promise` that resolves to true if the code is running in a Docker container.

**Params**

-   **`forceReset`**: `boolean`

---

<a name="sleep"></a>

## `utils.sleep(millis)`

**Returns**: `Promise<void>`

Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting in your code, e.g. to prevent overloading of
target website or to avoid bot detection.

**Example usage:**

```
const Apify = require('apify');

...

// Sleep 1.5 seconds
await Apify.utils.sleep(1500);
```

**Params**

-   **`millis`**: `Number` - Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.

---

<a name="downloadlistofurls"></a>

## `utils.downloadListOfUrls(options)`

**Returns**: `Promise<Array<String>>`

Returns a promise that resolves to an array of urls parsed from the resource available at the provided url. Optionally, custom regular expression and
encoding may be provided.

**Params**

-   **`options`**: `Object`
    -   **`.url`**: `String` - URL to the file
    -   **`[.encoding]`**: `String` <code> = &#x27;utf8&#x27;</code> - The encoding of the file.
    -   **`[.urlRegExp]`**: `RegExp` <code> = URL_NO_COMMAS_REGEX</code> - Custom regular expression to identify the URLs in the file to extract. The
        regular expression should be case-insensitive and have global flag set (i.e. `/something/gi`).

---

<a name="extracturls"></a>

## `utils.extractUrls(options)`

**Returns**: `Array<String>`

Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.

**Params**

-   **`options`**: `Object`
    -   **`.string`**: `String`
    -   **`[.urlRegExp]`**: `RegExp` <code> = Apify.utils.URL_NO_COMMAS_REGEX</code>

---

<a name="getrandomuseragent"></a>

## `utils.getRandomUserAgent()`

**Returns**: `String`

Returns a randomly selected User-Agent header out of a list of the most common headers.

---

<a name="htmltotext"></a>

## `utils.htmlToText(html)`

**Returns**: `String` - Plain text

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

**Params**

-   **`html`**: `String` | `Cheerio` - HTML text or parsed HTML represented using a [cheerio](https://www.npmjs.com/package/cheerio) function.

---

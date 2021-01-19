---
id: version-0.22.4-utils
title: utils
original_id: utils
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

The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default) either in a Puppeteer page, or in a Cheerio object
(parsed HTML), and enqueues the URLs in their `href` attributes to the provided [`RequestQueue`](../api/request-queue). If you're looking to find URLs
in JavaScript heavy pages where links are not available in `href` elements, but rather navigations are triggered in click handlers see
[`puppeteer.enqueueLinksByClickingElements()`](../api/puppeteer#enqueuelinksbyclickingelements).

Optionally, the function allows you to filter the target links' URLs using an array of [`PseudoUrl`](../api/pseudo-url) objects and override settings
of the enqueued [`Request`](../api/request) objects.

**Example usage**

```javascript
await Apify.utils.enqueueLinks({
    page,
    requestQueue,
    selector: 'a.product-detail',
    pseudoUrls: ['https://www.example.com/handbags/[.*]', 'https://www.example.com/purses/[.*]'],
});
```

**Parameters**:

-   **`options`**: `Object` - All `enqueueLinks()` parameters are passed via an options object with the following keys:

    -   **`[page]`**: `Page` - Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object. Either `page` or `$` option must
        be provided.
    -   **`[limit]`**: `Number` - Limit the count of actually enqueued URLs to this number. Useful for testing across the entire crawling scope.
    -   **`[$]`**: `CheerioStatic` - [`Cheerio`](https://github.com/cheeriojs/cheerio) function with loaded HTML. Either `page` or `$` option must be
        provided.
    -   **`requestQueue`**: [`RequestQueue`](../api/request-queue) - A request queue to which the URLs will be enqueued.
    -   **`[selector]`**: `string` <code> = &quot;&#x27;a&#x27;&quot;</code> - A CSS selector matching links to be enqueued.
    -   **`[baseUrl]`**: `string` - A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer, since the
        relative URL resolution is done inside the browser automatically.
    -   **`[pseudoUrls]`**: `Array<Object&gt;` | `Array.&lt;string>` - An array of [`PseudoUrl`](../api/pseudo-url)s matching the URLs to be enqueued,
        or an array of strings or RegExps or plain Objects from which the [`PseudoUrl`](../api/pseudo-url)s can be constructed.

    The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp. All remaining keys will be used as the
    `requestTemplate` argument of the [`PseudoUrl`](../api/pseudo-url) constructor, which lets you specify special properties for the enqueued
    [`Request`](../api/request) objects.

    If `pseudoUrls` is an empty array, `null` or `undefined`, then the function enqueues all links found on the page.

    -   **`[transformRequestFunction]`**: [`RequestTransform`](../typedefs/request-transform) - Just before a new [`Request`](../api/request) is
        constructed and enqueued to the [`RequestQueue`](../api/request-queue), this function can be used to remove it or modify its contents such as
        `userData`, `payload` or, most importantly `uniqueKey`. This is useful when you need to enqueue multiple `Requests` to the queue that share
        the same URL, but differ in methods or payloads, or to dynamically update or create `userData`.

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

**Returns**:

[`Promise<Array<QueueOperationInfo>>`](../typedefs/queue-operation-info) - Promise that resolves to an array of
[`QueueOperationInfo`](../typedefs/queue-operation-info) objects.

---

<a name="requestasbrowser"></a>

## `utils.requestAsBrowser(options)`

**IMPORTANT:** This function uses an insecure version of HTTP parser by default and also ignores SSL/TLS errors. This is very useful in scraping,
because it allows bypassing certain anti-scraping walls, but it also exposes some vulnerability. For other than scraping scenarios, please set
`useInsecureHttpParser: false` and `ignoreSslErrors: false`.

Sends a HTTP request that looks like a request sent by a web browser, fully emulating browser's HTTP headers.

This function is useful for web scraping of websites that send the full HTML in the first response. Thanks to this function, the target web server has
no simple way to find out the request hasn't been sent by a full web browser. Using a headless browser for such requests is an order of magnitude more
resource-intensive than this function. By default it aborts all requests that returns 406 status codes or non-HTML content-types. You can override
this behavior by passing custom `abortFunction`.

Currently, the function sends requests the same way as Firefox web browser does. In the future, it might add support for other browsers too.

Internally, the function uses `httpRequest` function from the [@apify/http-request](https://github.com/apify/http-request) NPM package to perform the
request. All `options` not recognized by this function are passed to it, so see it for more details.

**Example usage:**

```js
const Apify = require('apify');

const { utils: { requestAsBrowser } } = Apify;

...

const response = await requestAsBrowser({ url: 'https://www.example.com/' });

const html = response.body;
const status = response.statusCode;
const contentType = response.headers['content-type'];
```

**Parameters**:

-   **`options`**: [`RequestAsBrowserOptions`](../typedefs/request-as-browser-options) - All `requestAsBrowser` configuration options.

**Returns**:

`Promise<(IncomingMessage|Readable)>` - This will typically be a
[Node.js HTTP response stream](https://nodejs.org/api/http.html#http_class_http_incomingmessage), however, if returned from the cache it will be a
[response-like object](https://github.com/lukechilds/responselike) which behaves in the same way.

---

<a name="isdocker"></a>

## `utils.isDocker(forceReset)`

Returns a `Promise` that resolves to true if the code is running in a Docker container.

**Parameters**:

-   **`forceReset`**: `boolean`

**Returns**:

`Promise<boolean>`

---

<a name="sleep"></a>

## `utils.sleep(millis)`

Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting in your code, e.g. to prevent overloading of
target website or to avoid bot detection.

**Example usage:**

```
const Apify = require('apify');

...

// Sleep 1.5 seconds
await Apify.utils.sleep(1500);
```

**Parameters**:

-   **`millis`**: `number` - Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.

**Returns**:

`Promise<void>`

---

<a name="downloadlistofurls"></a>

## `utils.downloadListOfUrls(options)`

Returns a promise that resolves to an array of urls parsed from the resource available at the provided url. Optionally, custom regular expression and
encoding may be provided.

**Parameters**:

-   **`options`**: `Object`
    -   **`url`**: `string` - URL to the file
    -   **`[encoding]`**: `string` <code> = &quot;&#x27;utf8&#x27;&quot;</code> - The encoding of the file.
    -   **`[urlRegExp]`**: `RegExp` <code> = URL_NO_COMMAS_REGEX</code> - Custom regular expression to identify the URLs in the file to extract. The
        regular expression should be case-insensitive and have global flag set (i.e. `/something/gi`).

**Returns**:

`Promise<Array<string>>`

---

<a name="extracturls"></a>

## `utils.extractUrls(options)`

Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.

**Parameters**:

-   **`options`**: `Object`
    -   **`string`**: `string`
    -   **`[urlRegExp]`**: `RegExp` <code> = Apify.utils.URL_NO_COMMAS_REGEX</code>

**Returns**:

`Array<string>`

---

<a name="htmltotext"></a>

## `utils.htmlToText(html)`

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

**Parameters**:

-   **`html`**: `string` | `CheerioStatic` - HTML text or parsed HTML represented using a [cheerio](https://www.npmjs.com/package/cheerio) function.

**Returns**:

`string` - Plain text

---

<a name="waitforruntofinish"></a>

## `utils.waitForRunToFinish(options)`

Returns a promise that resolves with the finished Run object when the provided actor run finishes or with the unfinished Run object when the
`waitSecs` timeout lapses. The promise is NOT rejected based on run status. You can inspect the `status` property of the Run object to find out its
status.

This is useful when you need to chain actor executions. Similar effect can be achieved by using webhooks, so be sure to review which technique fits
your use-case better.

**Parameters**:

-   **`options`**: `object`
    -   **`actorId`**: `string` - ID of the actor that started the run.
    -   **`runId`**: `string` - ID of the run itself.
    -   **`[waitSecs]`**: `string` - Maximum time to wait for the run to finish, in seconds. If the limit is reached, the returned promise is resolved
        to a run object that will have status `READY` or `RUNNING`. If `waitSecs` omitted, the function waits indefinitely.
    -   **`[token]`**: `string` - You can supply an Apify token to override the default one that's used by the default ApifyClient instance. E.g. you
        can track other users' runs.

**Returns**:

[`Promise<ActorRun>`](../typedefs/actor-run)

---

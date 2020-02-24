---
id: request
title: Request
---

<a name="request"></a>

Represents a URL to be crawled, optionally including HTTP method, headers, payload and other metadata. The `Request` object also stores information
about errors that occurred during processing of the request.

Each `Request` instance has the `uniqueKey` property, which can be either specified manually in the constructor or generated automatically from the
URL. Two requests with the same `uniqueKey` are considered as pointing to the same web resource. This behavior applies to all Apify SDK classes, such
as [`RequestList`](/docs/api/request-list), [`RequestQueue`](/docs/api/request-queue) or [`PuppeteerCrawler`](/docs/api/puppeteer-crawler).

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

## Properties

### `id`

**Type**: `String`

Request ID

---

### `url`

**Type**: `String`

URL of the web page to crawl.

---

### `loadedUrl`

**Type**: `String`

An actually loaded URL after redirects, if present. HTTP redirects are guaranteed to be included.

When using [`PuppeteerCrawler`](/docs/api/puppeteer-crawler), meta tag and JavaScript redirects may, or may not be included, depending on their
nature. This generally means that redirects, which happen immediately will most likely be included, but delayed redirects will not.

---

### `uniqueKey`

**Type**: `String`

A unique key identifying the request. Two requests with the same `uniqueKey` are considered as pointing to the same URL.

---

### `method`

**Type**: `String`

HTTP method, e.g. `GET` or `POST`.

---

### `payload`

**Type**: `String` | `Buffer`

HTTP request payload, e.g. for POST requests.

---

### `noRetry`

**Type**: `Boolean`

The `true` value indicates that the request will not be automatically retried on error.

---

### `retryCount`

**Type**: `Number`

Indicates the number of times the crawling of the request has been retried on error.

---

### `errorMessages`

**Type**: `Array<String>`

An array of error messages from request processing.

---

### `headers`

**Type**: `Object`

Object with HTTP headers. Key is header name, value is the value.

---

### `userData`

**Type**: `Object`

Custom user data assigned to the request.

---

### `handledAt`

**Type**: `Date`

Indicates the time when the request has been processed. Is `null` if the request has not been crawled yet.

---

<a name="request"></a>

## `new Request(options)`

**Params**

-   **`options`**: [`RequestOptions`](/docs/typedefs/request-options) - `Request` parameters including the URL, HTTP method and headers, and others.

---

<a name="pusherrormessage"></a>

## `request.pushErrorMessage(errorOrMessage, [options])`

Stores information about an error that occurred during processing of this request.

You should always use Error instances when throwing errors in JavaScript.

Nevertheless, to improve the debugging experience when using third party libraries that may not always throw an Error instance, the function performs
a type inspection of the passed argument and attempts to extract as much information as possible, since just throwing a bad type error makes any
debugging rather difficult.

**Params**

-   **`errorOrMessage`**: `Error` | `String` - Error object or error message to be stored in the request.
-   **`[options]`**: `Object`
    -   **`[.omitStack]`**: `Boolean` <code> = false</code> - Only push the error message without stack trace when true.

---

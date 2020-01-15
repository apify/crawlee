---
id: puppeteer
title: utils.puppeteer
---

<a name="puppeteer"></a>

A namespace that contains various utilities for [Puppeteer](https://github.com/GoogleChrome/puppeteer) - the headless Chrome Node API.

**Example usage:**

```javascript
const Apify = require('apify');
const { puppeteer } = Apify.utils;

// Open https://www.example.com in Puppeteer
const browser = await Apify.launchPuppeteer();
const page = await browser.newPage();
await page.goto('https://www.example.com');

// Inject jQuery into a page
await puppeteer.injectJQuery(page);
```

-   [`puppeteer`](#puppeteer) : `object`
    -   [`.enqueueLinksByClickingElements`](#puppeteer.enqueueLinksByClickingElements) ⇒ `Promise<Array<QueueOperationInfo>>`
    -   [`.addInterceptRequestHandler`](#puppeteer.addInterceptRequestHandler) ⇒ `Promise`
    -   [`.removeInterceptRequestHandler`](#puppeteer.removeInterceptRequestHandler) ⇒ `Promise`
    -   [`.gotoExtended`](#puppeteer.gotoExtended) ⇒ `Promise<Response>`
    -   [`.infiniteScroll`](#puppeteer.infiniteScroll) ⇒ `Promise`
    -   [`.saveSnapshot`](#puppeteer.saveSnapshot) ⇒ `Promise`
    -   [`.injectFile(page, filePath, [options])`](#puppeteer.injectFile) ⇒ `Promise`
    -   [`.injectJQuery(page)`](#puppeteer.injectJQuery) ⇒ `Promise`
    -   [`.injectUnderscore(page)`](#puppeteer.injectUnderscore) ⇒ `Promise`
    -   [`.blockRequests(page, [options])`](#puppeteer.blockRequests) ⇒ `Promise`
    -   ~~[`.cacheResponses(page, cache, responseUrlRules)`](#puppeteer.cacheResponses) ⇒ `Promise`~~
    -   [`.compileScript(scriptString, context)`](#puppeteer.compileScript) ⇒ `function`

<a name="puppeteer.enqueueLinksByClickingElements"></a>

## `puppeteer.enqueueLinksByClickingElements` ⇒ `Promise<Array<QueueOperationInfo>>`

The function finds elements matching a specific CSS selector in a Puppeteer page, clicks all those elements using a mouse move and a left mouse button
click and intercepts all the navigation requests that are subsequently produced by the page. The intercepted requests, including their methods,
headers and payloads are then enqueued to a provided [`RequestQueue`](requestqueue). This is useful to crawl JavaScript heavy pages where links are
not available in `href` elements, but rather navigations are triggered in click handlers. If you're looking to find URLs in `href` attributes of the
page, see [`enqueueLinks()`](utils#utils.enqueueLinks).

Optionally, the function allows you to filter the target links' URLs using an array of [`PseudoUrl`](pseudourl) objects and override settings of the
enqueued [`Request`](request) objects.

**IMPORTANT**: To be able to do this, this function uses various mutations on the page, such as changing the Z-index of elements being clicked and
their visibility. Therefore, it is recommended to only use this function as the last operation in the page.

**USING HEADFUL BROWSER**: When using a headful browser, this function will only be able to click elements in the focused tab, effectively limiting
concurrency to 1. In headless mode, full concurrency can be achieved.

**PERFORMANCE**: Clicking elements with a mouse and intercepting requests is not a low level operation that takes nanoseconds. It's not very CPU
intensive, but it takes time. We strongly recommend limiting the scope of the clicking as much as possible by using a specific selector that targets
only the elements that you assume or know will produce a navigation. You can certainly click everything by using the `*` selector, but be prepared to
wait minutes to get results on a large and complex page.

**Example usage**

```javascript
const Apify = require('apify');

const browser = await Apify.launchPuppeteer();
const page = await browser.goto('https://www.example.com');
const requestQueue = await Apify.openRequestQueue();

await Apify.utils.enqueueLinksByClickingElements({
  page,
  requestQueue,
  selector: 'a.product-detail',
  pseudoUrls: [
      'https://www.example.com/handbags/[.*]'
      'https://www.example.com/purses/[.*]'
  ],
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
<td colspan="3"><p>All <code>enqueueLinksByClickingElements()</code> parameters are passed
  via an options object with the following keys:</p>
</td></tr><tr>
<td><code>options.page</code></td><td><code>Page</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>options.requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A request queue to which the URLs will be enqueued.</p>
</td></tr><tr>
<td><code>options.selector</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>A CSS selector matching elements to be clicked on. Unlike in <a href="utils#utils.enqueueLinks"><code>enqueueLinks()</code></a>, there is no default
  value. This is to prevent suboptimal use of this function by using it too broadly.</p>
</td></tr><tr>
<td><code>[options.pseudoUrls]</code></td><td><code>Array<(String|RegExp|Object)></code></td><td></td>
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
<p>  For example: by adding <code>useExtendedUniqueKey: true</code> to the <code>request</code> object, <code>uniqueKey</code> will be computed from
  a combination of <code>url</code>, <code>method</code> and <code>payload</code> which enables crawling of websites that navigate using form submits
  (POST requests).</p>
<p>  <strong>Example:</strong></p>
<pre><code class="language-javascript">  {
      transformRequestFunction: (request) =&gt; {
          request.userData.foo = &#39;bar&#39;;
          request.useExtendedUniqueKey = true;
          return request;
      }
  }</code></pre>
</td></tr><tr>
<td><code>[options.waitForPageIdleSecs]</code></td><td><code>number</code></td><td><code>1</code></td>
</tr>
<tr>
<td colspan="3"><p>Clicking in the page triggers various asynchronous operations that lead to new URLs being shown
  by the browser. It could be a simple JavaScript redirect or opening of a new tab in the browser.
  These events often happen only some time after the actual click. Requests typically take milliseconds
  while new tabs open in hundreds of milliseconds.</p>
<p>  To be able to capture all those events, the <code>enqueueLinksByClickingElements()</code> function repeatedly waits
  for the <code>waitForPageIdleSecs</code>. By repeatedly we mean that whenever a relevant event is triggered, the timer
  is restarted. As long as new events keep coming, the function will not return, unless
  the below <code>maxWaitForPageIdleSecs</code> timeout is reached.</p>
<p>  You may want to reduce this for example when you&#39;re sure that your clicks do not open new tabs,
  or increase when you&#39;re not getting all the expected URLs.</p>
</td></tr><tr>
<td><code>[options.maxWaitForPageIdleSecs]</code></td><td><code>number</code></td><td><code>5</code></td>
</tr>
<tr>
<td colspan="3"><p>This is the maximum period for which the function will keep tracking events, even if more events keep coming.
  Its purpose is to prevent a deadlock in the page by periodic events, often unrelated to the clicking itself.
  See <code>waitForPageIdleSecs</code> above for an explanation.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.addInterceptRequestHandler"></a>

## `puppeteer.addInterceptRequestHandler` ⇒ `Promise`

Adds request interception handler in similar to `page.on('request', handler);` but in addition to that supports multiple parallel handlers.

All the handlers are executed sequentially in the order as they were added. Each of the handlers must call one of `request.continue()`,
`request.abort()` and `request.respond()`. In addition to that any of the handlers may modify the request object (method, postData, headers) by
passing its overrides to `request.continue()`. If multiple handlers modify same property then the last one wins. Headers are merged separately so you
can override only a value of specific header.

If one the handlers calls `request.abort()` or `request.respond()` then request is not propagated further to any of the remaining handlers.

**Example usage:**

```javascript
// Replace images with placeholder.
await addInterceptRequestHandler(page, request => {
    if (request.resourceType() === 'image') {
        return request.respond({
            statusCode: 200,
            contentType: 'image/jpeg',
            body: placeholderImageBuffer,
        });
    }
    return request.continue();
});

// Abort all the scripts.
await addInterceptRequestHandler(page, request => {
    if (request.resourceType() === 'script') return request.abort();
    return request.continue();
});

// Change requests to post.
await addInterceptRequestHandler(page, request => {
    return request.continue({
        method: 'POST',
    });
});

await page.goto('http://example.com');
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>handler</code></td><td><code>function</code></td>
</tr>
<tr>
<td colspan="3"><p>Request interception handler.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.removeInterceptRequestHandler"></a>

## `puppeteer.removeInterceptRequestHandler` ⇒ `Promise`

Removes request interception handler for given page.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>handler</code></td><td><code>function</code></td>
</tr>
<tr>
<td colspan="3"><p>Request interception handler.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.gotoExtended"></a>

## `puppeteer.gotoExtended` ⇒ `Promise<Response>`

Extended version of Puppeteer's `page.goto()` allowing to perform requests with HTTP method other than GET, with custom headers and POST payload. URL,
method, headers and payload are taken from request parameter that must be an instance of Apify.Request class.

_NOTE:_ In recent versions of Puppeteer using requests other than GET, overriding headers and adding payloads disables browser cache which degrades
performance.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>request</code></td><td><code><a href="request">Request</a></code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>gotoOptions</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Custom options for <code>page.goto()</code>.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.infiniteScroll"></a>

## `puppeteer.infiniteScroll` ⇒ `Promise`

Scrolls to the bottom of a page, or until it times out. Loads dynamic content when it hits the bottom of a page, and then continues scrolling.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.timeoutSecs]</code></td><td><code>Number</code></td><td><code>0</code></td>
</tr>
<tr>
<td colspan="3"><p>How many seconds to scroll for. If 0, will scroll until bottom of page.</p>
</td></tr><tr>
<td><code>[options.waitForSecs]</code></td><td><code>Number</code></td><td><code>4</code></td>
</tr>
<tr>
<td colspan="3"><p>How many seconds to wait for no new content to load before exit.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.saveSnapshot"></a>

## `puppeteer.saveSnapshot` ⇒ `Promise`

Saves a full screenshot and HTML of the current page into a Key-Value store.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.key]</code></td><td><code>String</code></td><td><code>SNAPSHOT</code></td>
</tr>
<tr>
<td colspan="3"><p>Key under which the screenshot and HTML will be saved. <code>.jpg</code> will be appended for screenshot and <code>.html</code> for HTML.</p>
</td></tr><tr>
<td><code>[options.screenshotQuality]</code></td><td><code>Number</code></td><td><code>50</code></td>
</tr>
<tr>
<td colspan="3"><p>The quality of the image, between 0-100. Higher quality images have bigger size and require more storage.</p>
</td></tr><tr>
<td><code>[options.saveScreenshot]</code></td><td><code>Boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If true, it will save a full screenshot of the current page as a record with <code>key</code> appended by <code>.jpg</code>.</p>
</td></tr><tr>
<td><code>[options.saveHtml]</code></td><td><code>Boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If true, it will save a full HTML of the current page as a record with <code>key</code> appended by <code>.html</code>.</p>
</td></tr><tr>
<td><code>[options.keyValueStoreName]</code></td><td><code>String</code></td><td><code></code></td>
</tr>
<tr>
<td colspan="3"><p>Name or id of the Key-Value store where snapshot is saved. By default it is saved to default Key-Value store.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.injectFile"></a>

## `puppeteer.injectFile(page, filePath, [options])` ⇒ `Promise`

Injects a JavaScript file into a Puppeteer page. Unlike Puppeteer's `addScriptTag` function, this function works on pages with arbitrary Cross-Origin
Resource Sharing (CORS) policies.

File contents are cached for up to 10 files to limit file system access.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>filePath</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>File path</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.surviveNavigations]</code></td><td><code>boolean</code></td>
</tr>
<tr>
<td colspan="3"><p>Enables the injected script to survive page navigations and reloads without need to be re-injected manually.
  This does not mean, however, that internal state will be preserved. Just that it will be automatically
  re-injected on each navigation before any other scripts get the chance to execute.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.injectJQuery"></a>

## `puppeteer.injectJQuery(page)` ⇒ `Promise`

Injects the <a href="https://jquery.com/" target="_blank"><code>jQuery</code></a> library into a Puppeteer page. jQuery is often useful for various
web scraping and crawling tasks. For example, it can help extract text from HTML elements using CSS selectors.

Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with other libraries included by the
page that use the same variable name (e.g. another version of jQuery). This can affect functionality of page's scripts.

The injected jQuery will survive page navigations and reloads.

**Example usage:**

```javascript
await Apify.utils.puppeteer.injectJQuery(page);
const title = await page.evaluate(() => {
    return $('head title').text();
});
```

Note that `injectJQuery()` does not affect the Puppeteer's
<a href="https://pptr.dev/#?product=Puppeteer&show=api-pageselector" target="_blank"><code>Page.\$()</code></a> function in any way.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.injectUnderscore"></a>

## `puppeteer.injectUnderscore(page)` ⇒ `Promise`

Injects the <a href="https://underscorejs.org/" target="_blank"><code>Underscore.js</code></a> library into a Puppeteer page.

Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with libraries included by the
page that use the same variable name. This can affect functionality of page's scripts.

The injected Underscore will survive page navigations and reloads.

**Example usage:**

```javascript
await Apify.utils.puppeteer.injectUnderscore(page);
const escapedHtml = await page.evaluate(() => {
    return _.escape('<h1>Hello</h1>');
});
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page">Page</a> object.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.blockRequests"></a>

## `puppeteer.blockRequests(page, [options])` ⇒ `Promise`

Forces the Puppeteer browser tab to block loading URLs that match a provided pattern. This is useful to speed up crawling of websites, since it
reduces the amount of data that needs to be downloaded from the web, but it may break some websites or unexpectedly prevent loading of resources.

By default, the function will block all URLs including the following patterns:

```json
[".css", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".woff", ".pdf", ".zip"]
```

If you want to extend this list further, use the `extraUrlPatterns` option, which will keep blocking the default patterns, as well as add your custom
ones. If you would like to block only specific patterns, use the `urlPatterns` option, which will override the defaults and block only URLs with your
custom patterns.

This function does not use Puppeteer's request interception and therefore does not interfere with browser cache. It's also faster than blocking
requests using interception, because the blocking happens directly in the browser without the round-trip to Node.js, but it does not provide the extra
benefits of request interception.

The function will never block main document loads and their respective redirects.

**Example usage**

```javascript
const Apify = require('apify');

const browser = await Apify.launchPuppeteer();
const page = await browser.newPage();

// Block all requests to URLs that include `adsbygoogle.js` and also all defaults.
await Apify.utils.puppeteer.blockRequests(page, {
    extraUrlPatterns: ['adsbygoogle.js'],
});

await page.goto('https://cnn.com');
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.urlPatterns]</code></td><td><code>Array<string></code></td>
</tr>
<tr>
<td colspan="3"><p>The patterns of URLs to block from being loaded by the browser.
  Only <code>*</code> can be used as a wildcard. It is also automatically added to the beginning
  and end of the pattern. This limitation is enforced by the DevTools protocol.
  <code>.png</code> is the same as <code>*.png*</code>.</p>
</td></tr><tr>
<td><code>[options.extraUrlPatterns]</code></td><td><code>Array<string></code></td>
</tr>
<tr>
<td colspan="3"><p>If you just want to append to the default blocked patterns, use this property.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.cacheResponses"></a>

## ~~`puppeteer.cacheResponses(page, cache, responseUrlRules)` ⇒ `Promise`~~

**_Deprecated_**

_NOTE:_ In recent versions of Puppeteer using this function entirely disables browser cache which resolves in sub-optimal performance. Until this
resolves, we suggest just relying on the in-browser cache unless absolutely necessary.

Enables caching of intercepted responses into a provided object. Automatically enables request interception in Puppeteer. _IMPORTANT_: Caching
responses stores them to memory, so too loose rules could cause memory leaks for longer running crawlers. This issue should be resolved or atleast
mitigated in future iterations of this feature.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>cache</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object in which responses are stored</p>
</td></tr><tr>
<td><code>responseUrlRules</code></td><td><code>Array<(String|RegExp)></code></td>
</tr>
<tr>
<td colspan="3"><p>List of rules that are used to check if the response should be cached.
  String rules are compared as page.url().includes(rule) while RegExp rules are evaluated as rule.test(page.url()).</p>
</td></tr></tbody>
</table>
<a name="puppeteer.compileScript"></a>

## `puppeteer.compileScript(scriptString, context)` ⇒ `function`

Compiles a Puppeteer script into an async function that may be executed at any time by providing it with the following object:

```
{
   page: Page,
   request: Request,
}
```

Where `page` is a Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> and `request` is
a [`Request`](request).

The function is compiled by using the `scriptString` parameter as the function's body, so any limitations to function bodies apply. Return value of
the compiled function is the return value of the function body = the `scriptString` parameter.

As a security measure, no globals such as `process` or `require` are accessible from within the function body. Note that the function does not provide
a safe sandbox and even though globals are not easily accessible, malicious code may still execute in the main process via prototype manipulation.
Therefore you should only use this function to execute sanitized or safe code.

Custom context may also be provided using the `context` parameter. To improve security, make sure to only pass the really necessary objects to the
context. Preferably making secured copies beforehand.

**Returns**: `function` - `async ({ page, request }) => { scriptString }`

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>scriptString</code></td><td><code>String</code></td>
</tr>
<tr>
</tr><tr>
<td><code>context</code></td><td><code>Object</code></td>
</tr>
<tr>
</tr></tbody>
</table>

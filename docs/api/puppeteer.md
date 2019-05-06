---
id: puppeteer
title: utils.puppeteer
---
<a name="puppeteer"></a>

A namespace that contains various utilities for
[Puppeteer](https://github.com/GoogleChrome/puppeteer) - the headless Chrome Node API.

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


* [`puppeteer`](#puppeteer) : <code>object</code>
    * [`.addInterceptRequestHandler`](#puppeteer.addInterceptRequestHandler) ⇒ <code>Promise</code>
    * [`.removeInterceptRequestHandler`](#puppeteer.removeInterceptRequestHandler) ⇒ <code>Promise</code>
    * [`.gotoExtended`](#puppeteer.gotoExtended) ⇒ <code>Promise&lt;Response&gt;</code>
    * [`.hideWebDriver(page)`](#puppeteer.hideWebDriver) ⇒ <code>Promise</code>
    * [`.injectFile(page, filePath, [options])`](#puppeteer.injectFile) ⇒ <code>Promise</code>
    * [`.injectJQuery(page)`](#puppeteer.injectJQuery) ⇒ <code>Promise</code>
    * [`.injectUnderscore(page)`](#puppeteer.injectUnderscore) ⇒ <code>Promise</code>
    * [`.blockResources(page, [resourceTypes])`](#puppeteer.blockResources) ⇒ <code>Promise</code>
    * [`.cacheResponses(page, cache, responseUrlRules)`](#puppeteer.cacheResponses) ⇒ <code>Promise</code>
    * [`.compileScript(scriptString, context)`](#puppeteer.compileScript) ⇒ <code>function</code>

<a name="puppeteer.addInterceptRequestHandler"></a>

## `puppeteer.addInterceptRequestHandler` ⇒ <code>Promise</code>
Adds request interception handler in similar to `page.on('request', handler);` but in addition to that
supports multiple parallel handlers.

All the handlers are executed sequentially in the order as they were added.
Each of the handlers must call one of `request.continue()`, `request.abort()` and `request.respond()`.
In addition to that any of the handlers may modify the request object (method, postData, headers)
by passing its overrides to `request.continue()`.
If multiple handlers modify same property then the last one wins. Headers are merged separately so you can
override only a value of specific header.

If one the handlers calls `request.abort()` or `request.respond()` then request is not propagated further
to any of the remaining handlers.


**Example usage:**

```javascript
// Replace images with placeholder.
await addInterceptRequestHandler(page, (request) => {
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
await addInterceptRequestHandler(page, (request) => {
    if (request.resourceType() === 'script') return request.abort();
    return request.continue();
});

// Change requests to post.
await addInterceptRequestHandler(page, (request) => {
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

## `puppeteer.removeInterceptRequestHandler` ⇒ <code>Promise</code>
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

## `puppeteer.gotoExtended` ⇒ <code>Promise&lt;Response&gt;</code>
Extended version of Puppeteer's `page.goto()` allowing to perform requests with HTTP method other than GET,
with custom headers and POST payload. URL, method, headers and payload are taken from
request parameter that must be an instance of Apify.Request class.

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
<a name="puppeteer.hideWebDriver"></a>

## `puppeteer.hideWebDriver(page)` ⇒ <code>Promise</code>
Hides certain Puppeteer fingerprints from the page, in order to help avoid detection of the crawler.
The function should be called on a newly-created page object before navigating to the target crawled page.

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
<a name="puppeteer.injectFile"></a>

## `puppeteer.injectFile(page, filePath, [options])` ⇒ <code>Promise</code>
Injects a JavaScript file into a Puppeteer page.
Unlike Puppeteer's `addScriptTag` function, this function works on pages
with arbitrary Cross-Origin Resource Sharing (CORS) policies.

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

## `puppeteer.injectJQuery(page)` ⇒ <code>Promise</code>
Injects the <a href="https://jquery.com/" target="_blank"><code>jQuery</code></a> library into a Puppeteer page.
jQuery is often useful for various web scraping and crawling tasks.
For example, it can help extract text from HTML elements using CSS selectors.

Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
other libraries included by the page that use the same variable name (e.g. another version of jQuery).
This can affect functionality of page's scripts.

The injected jQuery will survive page navigations and reloads.

**Example usage:**
```javascript
await Apify.utils.puppeteer.injectJQuery(page);
const title = await page.evaluate(() => {
  return $('head title').text();
});
```

Note that `injectJQuery()` does not affect the Puppeteer's
<a href="https://pptr.dev/#?product=Puppeteer&show=api-pageselector" target="_blank"><code>Page.$()</code></a>
function in any way.

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

## `puppeteer.injectUnderscore(page)` ⇒ <code>Promise</code>
Injects the <a href="https://underscorejs.org/" target="_blank"><code>Underscore.js</code></a> library into a Puppeteer page.

Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with
libraries included by the page that use the same variable name.
This can affect functionality of page's scripts.

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
<a name="puppeteer.blockResources"></a>

## `puppeteer.blockResources(page, [resourceTypes])` ⇒ <code>Promise</code>
Forces the Puppeteer browser tab to block loading certain HTTP resources.
This is useful to speed up crawling of websites, since it reduces the amount
of data that need to be downloaded from the web.

The resource types to block can be specified using the `resourceTypes` parameter,
which indicates the types of resources as they are perceived by the rendering engine.
The following resource types are currently supported:
`document`, `stylesheet`, `image`, `media`, `font`, `script`, `texttrack`, `xhr`, `fetch`,
`eventsource`, `websocket`, `manifest`, `other`.
For more details, see Puppeteer's
<a href="https://pptr.dev/#?product=Puppeteer&show=api-requestresourcetype" target="_blank">Request.resourceType() documentation</a>.

If the `resourceTypes` parameter is not provided,
by default the function blocks these resource types: `stylesheet`, `font`, `image`, `media`.

Note that the `blockResources` function internally uses Puppeteer's
[`Page.setRequestInterception()`](https://pptr.dev/#?product=Puppeteer&show=api-pagesetrequestinterceptionvalue) function,
which can only be used once per `Page` object.

**Example usage**
```javascript
const Apify = require('apify');

const browser = await Apify.launchPuppeteer();
const page = await browser.newPage();

// Block all resources except for the main HTML document
await Apify.utils.puppeteer.blockResources(page,
  ['stylesheet', 'image', 'media', 'font', 'script', 'texttrack', 'xhr',
   'fetch', 'eventsource', 'websocket', 'manifest', 'other']
);

await page.goto('https://www.example.com');
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>page</code></td><td><code>Page</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a> object.</p>
</td></tr><tr>
<td><code>[resourceTypes]</code></td><td><code>Array&lt;String&gt;</code></td><td><code>[&#x27;stylesheet&#x27;, &#x27;font&#x27;, &#x27;image&#x27;, &#x27;media&#x27;]</code></td>
</tr>
<tr>
<td colspan="3"><p>Array of resource types to block.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.cacheResponses"></a>

## `puppeteer.cacheResponses(page, cache, responseUrlRules)` ⇒ <code>Promise</code>
Enables caching of intercepted responses into a provided object. Automatically enables request interception in Puppeteer.
*IMPORTANT*: Caching responses stores them to memory, so too loose rules could cause memory leaks for longer running crawlers.
  This issue should be resolved or atleast mitigated in future iterations of this feature.

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
<td><code>responseUrlRules</code></td><td><code>Array&lt;(String|RegExp)&gt;</code></td>
</tr>
<tr>
<td colspan="3"><p>List of rules that are used to check if the response should be cached.
  String rules are compared as page.url().includes(rule) while RegExp rules are evaluated as rule.test(page.url()).</p>
</td></tr></tbody>
</table>
<a name="puppeteer.compileScript"></a>

## `puppeteer.compileScript(scriptString, context)` ⇒ <code>function</code>
Compiles a Puppeteer script into an async function that may be executed at any time
by providing it with the following object:
```
{
   page: Page,
   request: Request,
}
```
Where `page` is a Puppeteer <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
and `request` is a [`Request`](request).

The function is compiled by using the `scriptString` parameter as the function's body,
so any limitations to function bodies apply. Return value of the compiled function
is the return value of the function body = the `scriptString` parameter.

As a security measure, no globals such as `process` or `require` are accessible
from within the function body. Note that the function does not provide a safe
sandbox and even though globals are not easily accessible, malicious code may
still execute in the main process via prototype manipulation. Therefore you
should only use this function to execute sanitized or safe code.

Custom context may also be provided using the `context` parameter. To improve security,
make sure to only pass the really necessary objects to the context. Preferably making
secured copies beforehand.

**Returns**: <code>function</code> - `async ({ page, request }) => { scriptString }`  
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

---
id: puppeteer
title: utils.puppeteer
---
<a name="puppeteer"></a>

A namespace that contains various Puppeteer utilities.

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
    * [`.hideWebDriver(page)`](#puppeteer.hideWebDriver) ⇒ <code>Promise</code>
    * [`.injectFile(page, filePath)`](#puppeteer.injectFile) ⇒ <code>Promise</code>
    * [`.injectJQuery(page)`](#puppeteer.injectJQuery) ⇒ <code>Promise</code>
    * [`.injectUnderscore(page)`](#puppeteer.injectUnderscore) ⇒ <code>Promise</code>
    * [`.enqueueLinks(page, selector, requestQueue, [pseudoUrls])`](#puppeteer.enqueueLinks) ⇒ <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code>
    * [`.blockResources(page, resourceTypes)`](#puppeteer.blockResources) ⇒ <code>Promise</code>
    * [`.cacheResponses(page, cache, responseUrlRules)`](#puppeteer.cacheResponses) ⇒ <code>Promise</code>
    * [`.compileScript(scriptString, context)`](#puppeteer.compileScript) ⇒ <code>function</code>

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

## `puppeteer.injectFile(page, filePath)` ⇒ <code>Promise</code>
Injects a JavaScript file into a Puppeteer page.
Unlike Puppeteer's `addScriptTag` function, this function works on pages
with arbitrary Cross-Origin Resource Sharing (CORS) policies.

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
</td></tr></tbody>
</table>
<a name="puppeteer.injectJQuery"></a>

## `puppeteer.injectJQuery(page)` ⇒ <code>Promise</code>
Injects the <a href="https://jquery.com/" target="_blank"><code>jQuery</code></a> library into a Puppeteer page.
jQuery is often useful for various web scraping and crawling tasks,
e.g. to extract data from HTML elements using CSS selectors.

Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
libraries included by the page that use the same variable (e.g. another version of jQuery).

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
libraries included by the page that use the same variable.

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
<a name="puppeteer.enqueueLinks"></a>

## `puppeteer.enqueueLinks(page, selector, requestQueue, [pseudoUrls])` ⇒ <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code>
Finds HTML elements matching a CSS selector, clicks the elements and if a redirect is triggered and destination URL matches
one of the provided [`PseudoUrl`](pseudourl)s, then the function enqueues that URL to a given request queue.
To create a Request object function uses `requestTemplate` from a matching [`PseudoUrl`](pseudourl).

*WARNING*: This is work in progress. Currently the function doesn't click elements and only takes their `href` attribute and so
           is working only for link (`a`) elements, but not for buttons or JavaScript links.

**Returns**: <code>Promise&lt;Array&lt;QueueOperationInfo&gt;&gt;</code> - Promise that resolves to an array of [`QueueOperationInfo`](../typedefs/queueoperationinfo) objects.
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
<td><code>selector</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>CSS selector matching elements to be clicked.</p>
</td></tr><tr>
<td><code>requestQueue</code></td><td><code><a href="requestqueue">RequestQueue</a></code></td>
</tr>
<tr>
<td colspan="3"><p><a href="requestqueue"><code>RequestQueue</code></a> instance where URLs will be enqueued.</p>
</td></tr><tr>
<td><code>[pseudoUrls]</code></td><td><code><a href="pseudourl">Array&lt;PseudoUrl&gt;</a></code> | <code>Array&lt;Object&gt;</code> | <code>Array&lt;String&gt;</code></td>
</tr>
<tr>
<td colspan="3"><p>An array of <a href="pseudourl"><code>PseudoUrl</code></a>s matching the URLs to be enqueued,
  or an array of Strings or Objects from which the <a href="pseudourl"><code>PseudoUrl</code></a>s should be constructed
  The Objects must include at least a <code>purl</code> property, which holds a pseudoUrl string.
  All remaining keys will be used as the <code>requestTemplate</code> argument of the <a href="pseudourl"><code>PseudoUrl</code></a> constructor.</p>
</td></tr></tbody>
</table>
<a name="puppeteer.blockResources"></a>

## `puppeteer.blockResources(page, resourceTypes)` ⇒ <code>Promise</code>
Forces the browser tab to block loading certain page resources,
using the `Page.setRequestInterception(value)` method.
This is useful to speed up crawling of websites.

The resource types to block can be controlled using the `resourceTypes` parameter,
which indicates the types of resources as they are perceived by the rendering engine.
The following resource types are currently supported:
`document`, `stylesheet`, `image`, `media`, `font`, `script`, `texttrack`, `xhr`, `fetch`,
`eventsource`, `websocket`, `manifest`, `other`.
For more details, see Puppeteer's
<a href="https://pptr.dev/#?product=Puppeteer&show=api-requestresourcetype" target="_blank">Request.resourceType() documentation</a>.

By default, the function blocks these resource types: `stylesheet`, `font`, `image`, `media`.

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
<td><code>resourceTypes</code></td><td><code>Array&lt;String&gt;</code></td>
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

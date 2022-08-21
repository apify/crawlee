# Browser Pool - the headless browser manager
Browser Pool is a small, but powerful and extensible library, that allows you to seamlessly
control multiple headless browsers at the same time with only a little configuration, and a
single function call. Currently, it supports [Puppeteer](https://github.com/puppeteer/puppeteer),
[Playwright](https://github.com/microsoft/playwright), and it can be easily extended with plugins.

We created Browser Pool because we regularly needed to execute tasks concurrently in many
headless browsers and their pages, but we did not want to worry about launching browsers, closing
browsers, restarting them after crashes and so on. We also wanted to easily and reliably manage
the whole browser / page lifecycle.

You can use Browser Pool for scraping the internet at scale, testing your website
in multiple browsers at the same time or launching web automation robots.

<!-- toc -->

- [Installation](#installation)
- [Usage](#usage)
- [Launching multiple browsers](#launching-multiple-browsers)
- [Features](#features)
  * [Simple configuration](#simple-configuration)
  * [Proxy management](#proxy-management)
  * [Lifecycle management with hooks](#lifecycle-management-with-hooks)
  * [Manipulating playwright context using `pageOptions` or `launchOptions`](#manipulating-playwright-context-using-pageoptions-or-launchoptions)
  * [Single API for common operations](#single-api-for-common-operations)
  * [Graceful browser closing](#graceful-browser-closing)
  * [Changing browser fingerprints a.k.a. browser signatures](#changing-browser-fingerprints-aka-browser-signatures)
  * [(UNSTABLE) Extensibility with plugins](#unstable-extensibility-with-plugins)
- [API Reference](#api-reference)

<!-- tocstop -->

## Installation
Use NPM or Yarn to install `@crawlee/browser-pool`. Note that `@crawlee/browser-pool` does not come preinstalled
with browser automation libraries. This allows you to choose your own libraries and their
versions, and it also makes `@crawlee/browser-pool` much smaller.

Run this command to install `@crawlee/browser-pool` and the `playwright` browser automation library.
```bash
npm install @crawlee/browser-pool playwright
```

## Usage
This simple example shows how to open a page in a browser using Browser Pool.
We use the provided `PlaywrightPlugin` to wrap a Playwright installation of
your own. By calling `browserPool.newPage()` you launch a new Firefox browser
and open a new page in that browser.

```js
import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';

const browserPool = new BrowserPool({
    browserPlugins: [new PlaywrightPlugin(playwright.chromium)],
});

// An asynchronous IIFE (immediately invoked function expression)
// allows us to use the 'await' keyword.
(async () => {
    // Launches Chromium with Playwright and returns a Playwright Page.
    const page1 = await browserPool.newPage();
    // You can interact with the page as you're used to.
    await page1.goto('https://example.com');
    // When you're done, close the page.
    await page1.close();

    // Opens a second page in the same browser.
    const page2 = await browserPool.newPage();
    // When everything's finished, tear down the pool.
    await browserPool.destroy();
})();
```

> Browser Pool uses the same asynchronous API as the underlying automation libraries which means
extensive use of Promises and the `async` / `await` pattern. [Visit MDN to learn more](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await).

## Launching multiple browsers
The basic example shows how to launch a single browser, but the purpose
of Browser Pool is to launch many browsers. This is done automatically
in the background. You only need to provide the relevant plugins and call
`browserPool.newPage()`.

```js
import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';

const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(playwright.chromium),
        new PlaywrightPlugin(playwright.firefox),
        new PlaywrightPlugin(playwright.webkit),
    ],
});

(async () => {
    // Open 4 pages in 3 browsers. The browsers are launched
    // in a round-robin fashion based on the plugin order.
    const chromiumPage = await browserPool.newPage();
    const firefoxPage = await browserPool.newPage();
    const webkitPage = await browserPool.newPage();
    const chromiumPage2 = await browserPool.newPage();

    // Don't forget to close pages / destroy pool when you're done.
})();
```

This round-robin way of opening pages may not be useful for you,
if you need to consistently run tasks in multiple environments.
For that, there's the `newPageWithEachPlugin` function.

```js
import { BrowserPool, PlaywrightPlugin, PuppeteerPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';
import puppeteer from 'puppeteer';

const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(playwright.chromium),
        new PuppeteerPlugin(puppeteer),
    ],
});

(async () => {
    const pages = await browserPool.newPageWithEachPlugin();
    const promises = pages.map(async page => {
        // Run some task with each page
        // pages are in order of plugins:
        // [playwrightPage, puppeteerPage]
        await page.close();
    });
    await Promise.all(promises);

    // Continue with some more work.
})();
```

## Features
Besides a simple interface for launching browsers, Browser Pool includes
other helpful features that make browser management more convenient.

### Simple configuration
You can easily set the maximum number of pages that can be open in a given
browser and also the maximum number of pages to process before a browser
[is retired](#graceful-browser-closing).

```js
const browserPool = new BrowserPool({
    maxOpenPagesPerBrowser: 20,
    retireBrowserAfterPageCount: 100,
});
```

You can configure the browser launch options either right in the plugins:

```js
const playwrightPlugin = new PlaywrightPlugin(playwright.chromium, {
    launchOptions: {
        headless: true,
    }
})
```

Or dynamically in [pre-launch hooks](#lifecycle-management-with-hooks):

```js
const browserPool = new BrowserPool({
    preLaunchHooks: [(pageId, launchContext) => {
        if (pageId === 'headful') {
            launchContext.launchOptions.headless = false;
        }
    }]
});
```

### Proxy management
When scraping at scale or testing websites from multiple geolocations,
one often needs to use proxy servers. Setting up an authenticated proxy
in Puppeteer can be cumbersome, so we created a helper that does all
the heavy lifting for you. Simply provide a proxy URL with authentication
credentials, and you're done. It works the same for Playwright too.

```js
const puppeteerPlugin = new PuppeteerPlugin(puppeteer, {
    proxyUrl: 'http://<username>:<password>@proxy.com:8000'
});
```

> We plan to extend this by adding a proxy-per-page functionality,
> allowing you to rotate proxies per page, rather than per browser.

### Lifecycle management with hooks
Browser Pool allows you to manage the full browser / page lifecycle
by attaching hooks to the most important events. Asynchronous hooks
are supported, and their execution order is guaranteed.

The first parameter of each hook is either a `pageId` for the hooks
executed before a `page` is created or a `page` afterwards. This is
useful to keep track of which hook was triggered by which `newPage()`
call.

```js
const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(playwright.chromium),
    ],
    preLaunchHooks: [(pageId, launchContext) => {
        // You can use pre-launch hooks to make dynamic changes
        // to the launchContext, such as changing a proxyUrl
        // or updating the browser launchOptions

        pageId === 'my-page' // true
    }],
    postPageCreateHooks: [(page, browserController) => {
        // It makes sense to make global changes to pages
        // in post-page-create hooks. For example, you can
        // inject some JavaScript library, such as jQuery.

        browserPool.getPageId(page) === 'my-page' // true
    }]
});

await browserPool.newPage({ id: 'my-page' });
```

> See the API Documentation for all hooks and their arguments.
### Manipulating playwright context using `pageOptions` or `launchOptions`
Playwright allows customizing multiple browser attributes by browser context.
You can customize some of them once the context is created, but some need to be customized within its creation.
This part of the documentation should explain how you can effectively customize the browser context.

First of all, let's take a look at what kind of context strategy you chose. You can choose between two strategies by `useIncognitoPages` `LaunchContext` option.

Suppose you decide to keep `useIncognitoPages` default `false` and create a shared context across all pages launched by one browser. In this case,  you should pass the `contextOptions` as a `launchOptions` since the context is created within the new browser launch. The `launchOptions` corresponds to these [playwright options](https://playwright.dev/docs/api/class-browsertype#browsertypelaunchpersistentcontextuserdatadir-options). As you can see, these options contain not only ordinary playwright launch options but also the context options.

If you set `useIncognitoPages` to `true`, you will create a new context within each new page, which allows you to handle each page its cookies and application data. This approach allows you to pass the context options as `pageOptions` because a new context is created once you create a new page. In this case, the `pageOptions` corresponds to these [playwright options](https://playwright.dev/docs/api/class-browser#browsernewpageoptions).

**Changing context options with `LaunchContext`:**

This will only work if you keep the default value for `useIncognitoPages` (`false`).
```javascript
const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(
            playwright.chromium,
            {
                launchOptions: {
                    deviceScaleFactor: 2,
                },
            },
        ),
    ],

});
```
**Changing context options with `browserPool.newPage` options:**

```javascript
const browserPool = new BrowserPool({
     browserPlugins: [
        new PlaywrightPlugin(
            playwright.chromium,
            {
                useIncognitoPages: true, // You must turn on incognito pages.
                launchOptions: {
                    // launch options
                    headless: false,
                    devtools: true,
                },
            },
        ),
    ],
});

(async () => {
    // Launches Chromium with Playwright and returns a Playwright Page.
    const page = await browserPool.newPage({
        pageOptions: {
            // context options
            deviceScaleFactor: 2,
            colorScheme: 'light',
            locale: 'de-DE',
        },
    });
})();

```
**Changing context options with `prePageCreateHooks` options:**
```javascript
const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(
            playwright.chromium,
            {
                useIncognitoPages: true,
                launchOptions: {
                // launch options
                    headless: false,
                    devtools: true,
                },
            },
        ),
    ],
    prePageCreateHooks: [
        (pageId, browserController, pageOptions) => {
            pageOptions.deviceScaleFactor = 2;
            pageOptions.colorScheme = 'dark';
            pageOptions.locale = 'de-DE';

            // You must modify the 'pageOptions' object, not assign to the variable.
            // pageOptions = {deviceScaleFactor: 2, ...etc} => This will not work!
        },
    ],
});

(async () => {
    // Launches Chromium with Playwright and returns a Playwright Page.
    const page = await browserPool.newPage();
})();
```
### Single API for common operations
Puppeteer and Playwright handle some things differently. Browser Pool
attempts to remove those differences for the most common use-cases.

```js
// Playwright
const cookies = await context.cookies();
await context.addCookies(cookies);

// Puppeteer
const cookies = await page.cookies();
await page.setCookie(...cookies);

// BrowserPool uses the same API for all plugins
const cookies = await browserController.getCookies(page);
await browserController.setCookies(page, cookies);
```

### Graceful browser closing
With Browser Pool, browsers are not closed, but retired. A retired browser
will no longer open new pages, but it will wait until the open pages are closed,
allowing your running tasks to finish. If a browser gets stuck in limbo,
it will be killed after a timeout to prevent hanging browser processes.

### Changing browser fingerprints a.k.a. browser signatures

> Fingerprints are enabled by default since v3.

Changing browser fingerprints is beneficial for avoiding getting blocked and simulating real user browsers.
With Browser Pool, you can do this otherwise complicated technique by enabling the `useFingerprints` option.
The fingerprints are by default tied to the respective proxy urls to not use the same unique fingerprint from various IP addresses.
You can disable this behavior in the [`fingerprintOptions`](#new_BrowserPool_new). In the `fingerprintOptions`, You can also control which fingerprints are generated.
You can control parameters as browser, operating system, and browser versions.

### (UNSTABLE) Extensibility with plugins
A new super cool browser automation library appears? No problem, we add
a simple plugin to Browser Pool, and it automagically works.

> The BrowserPlugin and BrowserController interfaces are unstable and may
> change if we find some implementation to be suboptimal.

## API Reference
All public classes, methods and their parameters can be inspected in this API reference.

<a name="module_browser-pool"></a>

### @crawlee/browser-pool
The `@crawlee/browser-pool` module exports three constructors. One for `BrowserPool`
itself and two for the included Puppeteer and Playwright plugins.

**Example:**
```js
import { BrowserPool, PuppeteerPlugin, PlaywrightPlugin } from '@crawlee/browser-pool';
import puppeteer from 'puppeteer';
import playwright from 'playwright';

const browserPool = new BrowserPool({
    browserPlugins: [
        new PuppeteerPlugin(puppeteer),
        new PlaywrightPlugin(playwright.chromium),
    ]
});
```

**Properties**

| Name | Type |
| --- | --- |
| BrowserPool | [<code>BrowserPool</code>](#BrowserPool) |
| PuppeteerPlugin | <code>PuppeteerPlugin</code> |
| PlaywrightPlugin | <code>PlaywrightPlugin</code> |


* * *

<a name="BrowserPool"></a>

### BrowserPool
The `BrowserPool` class is the most important class of the `@crawlee/browser-pool` module.
It manages opening and closing of browsers and their pages and its constructor
options allow easy configuration of the browsers' and pages' lifecycle.

The most important and useful constructor options are the various lifecycle hooks.
Those allow you to sequentially call a list of (asynchronous) functions at each
stage of the browser / page lifecycle.

**Example:**
```js
import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';

const browserPool = new BrowserPool({
    browserPlugins: [ new PlaywrightPlugin(playwright.chromium)],
    preLaunchHooks: [(pageId, launchContext) => {
        // do something before a browser gets launched
        launchContext.launchOptions.headless = false;
    }],
    postLaunchHooks: [(pageId, browserController) => {
        // manipulate the browser right after launch
        console.dir(browserController.browser.contexts());
    }],
    prePageCreateHooks: [(pageId, browserController) => {
        if (pageId === 'my-page') {
            // make changes right before a specific page is created
        }
    }],
    postPageCreateHooks: [async (page, browserController) => {
        // update some or all new pages
        await page.evaluate(() => {
            // now all pages will have 'foo'
            window.foo = 'bar'
        })
    }],
    prePageCloseHooks: [async (page, browserController) => {
        // collect information just before a page closes
        await page.screenshot();
    }],
    postPageCloseHooks: [(pageId, browserController) => {
        // clean up or log after a job is done
        console.log('Page closed: ', pageId)
    }]
});
```


* [BrowserPool](#BrowserPool)
    * [`new BrowserPool(options)`](#new_BrowserPool_new)
    * [`.newPage(options)`](#BrowserPool+newPage) ⇒ <code>Promise.&lt;Page&gt;</code>
    * [`.newPageInNewBrowser(options)`](#BrowserPool+newPageInNewBrowser) ⇒ <code>Promise.&lt;Page&gt;</code>
    * [`.newPageWithEachPlugin(optionsList)`](#BrowserPool+newPageWithEachPlugin) ⇒ <code>Promise.&lt;Array.&lt;Page&gt;&gt;</code>
    * [`.getBrowserControllerByPage(page)`](#BrowserPool+getBrowserControllerByPage) ⇒ [<code>BrowserController</code>](#BrowserController)
    * [`.getPage(id)`](#BrowserPool+getPage) ⇒ <code>Page</code>
    * [`.getPageId(page)`](#BrowserPool+getPageId) ⇒ <code>string</code>
    * [`.retireBrowserController(browserController)`](#BrowserPool+retireBrowserController)
    * [`.retireBrowserByPage(page)`](#BrowserPool+retireBrowserByPage)
    * [`.retireAllBrowsers()`](#BrowserPool+retireAllBrowsers)
    * [`.closeAllBrowsers()`](#BrowserPool+closeAllBrowsers) ⇒ <code>Promise.&lt;void&gt;</code>
    * [`.destroy()`](#BrowserPool+destroy) ⇒ <code>Promise.&lt;void&gt;</code>


* * *

<a name="new_BrowserPool_new"></a>

#### `new BrowserPool(options)`

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>object</code> |  |  |
| options.browserPlugins | [<code>Array.&lt;BrowserPlugin&gt;</code>](#BrowserPlugin) |  | Browser plugins are wrappers of browser automation libraries that  allow `BrowserPool` to control browsers with those libraries.  `@crawlee/browser-pool` comes with a `PuppeteerPlugin` and a `PlaywrightPlugin`. |
| [options.maxOpenPagesPerBrowser] | <code>number</code> | <code>20</code> | Sets the maximum number of pages that can be open in a browser at the  same time. Once reached, a new browser will be launched to handle the excess. |
| [options.retireBrowserAfterPageCount] | <code>number</code> | <code>100</code> | Browsers tend to get bloated after processing a lot of pages. This option  configures the number of processed pages after which the browser will  automatically retire and close. A new browser will launch in its place. |
| [options.operationTimeoutSecs] | <code>number</code> | <code>15</code> | As we know from experience, async operations of the underlying libraries,  such as launching a browser or opening a new page, can get stuck.  To prevent `BrowserPool` from getting stuck, we add a timeout  to those operations and you can configure it with this option. |
| [options.closeInactiveBrowserAfterSecs] | <code>number</code> | <code>300</code> | Browsers normally close immediately after their last page is processed.  However, there could be situations where this does not happen. Browser Pool  makes sure all inactive browsers are closed regularly, to free resources. |
| [options.preLaunchHooks] | <code>Array.&lt;function()&gt;</code> |  | Pre-launch hooks are executed just before a browser is launched and provide  a good opportunity to dynamically change the launch options.  The hooks are called with two arguments:  `pageId`: `string` and `launchContext`: [LaunchContext](#LaunchContext) |
| [options.postLaunchHooks] | <code>Array.&lt;function()&gt;</code> |  | Post-launch hooks are executed as soon as a browser is launched.  The hooks are called with two arguments:  `pageId`: `string` and `browserController`: [BrowserController](#BrowserController)  To guarantee order of execution before other hooks in the same browser,  the [BrowserController](#BrowserController) methods cannot be used until the post-launch  hooks complete. If you attempt to call `await browserController.close()` from  a post-launch hook, it will deadlock the process. This API is subject to change. |
| [options.prePageCreateHooks] | <code>Array.&lt;function()&gt;</code> |  | Pre-page-create hooks are executed just before a new page is created. They  are useful to make dynamic changes to the browser before opening a page.  The hooks are called with two arguments:  `pageId`: `string`, `browserController`: [BrowserController](#BrowserController) and  `pageOptions`: `object|undefined` - This only works if the underlying `BrowserController` supports new page options.  So far, new page options are only supported by `PlaywrightController`.  If the page options are not supported by `BrowserController` the `pageOptions` argument is `undefined`. |
| [options.postPageCreateHooks] | <code>Array.&lt;function()&gt;</code> |  | Post-page-create hooks are called right after a new page is created  and all internal actions of Browser Pool are completed. This is the  place to make changes to a page that you would like to apply to all  pages. Such as injecting a JavaScript library into all pages.  The hooks are called with two arguments:  `page`: `Page` and `browserController`: [BrowserController](#BrowserController) |
| [options.prePageCloseHooks] | <code>Array.&lt;function()&gt;</code> |  | Pre-page-close hooks give you the opportunity to make last second changes  in a page that's about to be closed, such as saving a snapshot or updating  state.  The hooks are called with two arguments:  `page`: `Page` and `browserController`: [BrowserController](#BrowserController) |
| [options.postPageCloseHooks] | <code>Array.&lt;function()&gt;</code> |  | Post-page-close hooks allow you to do page related clean up.  The hooks are called with two arguments:  `pageId`: `string` and `browserController`: [BrowserController](#BrowserController) |
| [options.useFingerprints] | <code>boolean</code> | <code>false</code> | If true the Browser pool will automatically generate and inject fingerprints to browsers. |
| [options.fingerprintOptions] | <code>FingerprintOptions </code> |  | Fingerprints options that allows customizing the fingerprinting behavior. |
| [options.fingerprintOptions.fingerprintGeneratorOptions] |  |  | See the [Fingerprint generator](https://github.com/apify/fingerprint-generator#headergeneratoroptions) documentation. |
| [options.fingerprintOptions.useFingerprintCache] | <code>boolean</code> | <code>true</code> | Fingerprints are automatically assigned to an instance of a Session or proxy URL. You can disable this behavior by setting this property to `false`. |
| [options.fingerprintOptions.fingerprintCacheSize] | <code>number</code> | <code>10000</code> | Maximum number of cached browser fingerprints. |
* * *

<a name="BrowserPool+newPage"></a>

#### `browserPool.newPage(options)` ⇒ <code>Promise.&lt;Page&gt;</code>
Opens a new page in one of the running browsers or launches
a new browser and opens a page there, if no browsers are active,
or their page limits have been exceeded.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| [options.id] | <code>string</code> | Assign a custom ID to the page. If you don't a random string ID  will be generated. |
| [options.pageOptions] | <code>object</code> | Some libraries (Playwright) allow you to open new pages with specific  options. Use this property to set those options. |
| [options.browserPlugin] | [<code>BrowserPlugin</code>](#BrowserPlugin) | Choose a plugin to open the page with. If none is provided,  one of the pool's available plugins will be used.  It must be one of the plugins browser pool was created with.  If you wish to start a browser with a different configuration,  see the `newPageInNewBrowser` function. |


* * *

<a name="BrowserPool+newPageInNewBrowser"></a>

#### `browserPool.newPageInNewBrowser(options)` ⇒ <code>Promise.&lt;Page&gt;</code>
Unlike [newPage](#BrowserPool+newPage), `newPageInNewBrowser` always launches a new
browser to open the page in. Use the `launchOptions` option to
configure the new browser.


| Param | Type | Description |
| --- | --- | --- |
| options | <code>object</code> |  |
| [options.id] | <code>string</code> | Assign a custom ID to the page. If you don't a random string ID  will be generated. |
| [options.pageOptions] | <code>object</code> | Some libraries (Playwright) allow you to open new pages with specific  options. Use this property to set those options. |
| [options.launchOptions] | <code>object</code> | Options that will be used to launch the new browser. |
| [options.browserPlugin] | [<code>BrowserPlugin</code>](#BrowserPlugin) | Provide a plugin to launch the browser. If none is provided,  one of the pool's available plugins will be used.  If you configured `BrowserPool` to rotate multiple libraries,  such as both Puppeteer and Playwright, you should always set  the `browserPlugin` when using the `launchOptions` option.  The plugin will not be added to the list of plugins used by  the pool. You can either use one of those, to launch a specific  browser, or provide a completely new configuration. |


* * *

<a name="BrowserPool+newPageWithEachPlugin"></a>

#### `browserPool.newPageWithEachPlugin(optionsList)` ⇒ <code>Promise.&lt;Array.&lt;Page&gt;&gt;</code>
Opens new pages with all available plugins and returns an array
of pages in the same order as the plugins were provided to `BrowserPool`.
This is useful when you want to run a script in multiple environments
at the same time, typically in testing or website analysis.

**Example:**
```js
const browserPool = new BrowserPool({
    browserPlugins: [
        new PlaywrightPlugin(playwright.chromium),
        new PlaywrightPlugin(playwright.firefox),
        new PlaywrightPlugin(playwright.webkit),
        new PuppeteerPlugin(puppeteer),
    ]
});

const pages = await browserPool.newPageWithEachPlugin();
const [chromiumPage, firefoxPage, webkitPage, puppeteerPage] = pages;
```


| Param | Type |
| --- | --- |
| optionsList | <code>Array.&lt;object&gt;</code> |


* * *

<a name="BrowserPool+getBrowserControllerByPage"></a>

#### `browserPool.getBrowserControllerByPage(page)` ⇒ [<code>BrowserController</code>](#BrowserController)
Retrieves a [BrowserController](#BrowserController) for a given page. This is useful
when you're working only with pages and need to access the browser
manipulation functionality.

You could access the browser directly from the page,
but that would circumvent `BrowserPool` and most likely
cause weird things to happen, so please always use `BrowserController`
to control your browsers. The function returns `undefined` if the
browser is closed.


| Param | Type | Description |
| --- | --- | --- |
| page | <code>Page</code> | Browser plugin page |


* * *

<a name="BrowserPool+getPage"></a>

#### `browserPool.getPage(id)` ⇒ <code>Page</code>
If you provided a custom ID to one of your pages or saved the
randomly generated one, you can use this function to retrieve
the page. If the page is no longer open, the function will
return `undefined`.


| Param | Type |
| --- | --- |
| id | <code>string</code> |


* * *

<a name="BrowserPool+getPageId"></a>

#### `browserPool.getPageId(page)` ⇒ <code>string</code>
Page IDs are used throughout `BrowserPool` as a method of linking
events. You can use a page ID to track the full lifecycle of the page.
It is created even before a browser is launched and stays with the page
until it's closed.


| Param | Type |
| --- | --- |
| page | <code>Page</code> |


* * *

<a name="BrowserPool+retireBrowserController"></a>

#### `browserPool.retireBrowserController(browserController)`
Removes a browser controller from the pool. The underlying
browser will be closed after all its pages are closed.


| Param | Type |
| --- | --- |
| browserController | [<code>BrowserController</code>](#BrowserController) |


* * *

<a name="BrowserPool+retireBrowserByPage"></a>

#### `browserPool.retireBrowserByPage(page)`
Removes a browser from the pool. It will be
closed after all its pages are closed.


| Param | Type |
| --- | --- |
| page | <code>Page</code> |


* * *

<a name="BrowserPool+retireAllBrowsers"></a>

#### `browserPool.retireAllBrowsers()`
Removes all active browsers from the pool. The browsers will be
closed after all their pages are closed.


* * *

<a name="BrowserPool+closeAllBrowsers"></a>

#### `browserPool.closeAllBrowsers()` ⇒ <code>Promise.&lt;void&gt;</code>
Closes all managed browsers without waiting for pages to close.


* * *

<a name="BrowserPool+destroy"></a>

#### `browserPool.destroy()` ⇒ <code>Promise.&lt;void&gt;</code>
Closes all managed browsers and tears down the pool.


* * *

<a name="BrowserController"></a>

### BrowserController
The `BrowserController` serves two purposes. First, it is the base class that
specialized controllers like `PuppeteerController` or `PlaywrightController`
extend. Second, it defines the public interface of the specialized classes
which provide only private methods. Therefore, we do not keep documentation
for the specialized classes, because it's the same for all of them.

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> |  |
| browserPlugin | [<code>BrowserPlugin</code>](#BrowserPlugin) | The `BrowserPlugin` instance used to launch the browser. |
| browser | <code>Browser</code> | Browser representation of the underlying automation library. |
| launchContext | [<code>LaunchContext</code>](#LaunchContext) | The configuration the browser was launched with. |


* [BrowserController](#BrowserController)
    * [`.close()`](#BrowserController+close) ⇒ <code>Promise.&lt;void&gt;</code>
    * [`.kill()`](#BrowserController+kill) ⇒ <code>Promise.&lt;void&gt;</code>
    * [`.setCookies(page, cookies)`](#BrowserController+setCookies) ⇒ <code>Promise.&lt;void&gt;</code>
    * [`.getCookies(page)`](#BrowserController+getCookies) ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>


* * *

<a name="BrowserController+close"></a>

#### `browserController.close()` ⇒ <code>Promise.&lt;void&gt;</code>
Gracefully closes the browser and makes sure
there will be no lingering browser processes.

Emits 'browserClosed' event.


* * *

<a name="BrowserController+kill"></a>

#### `browserController.kill()` ⇒ <code>Promise.&lt;void&gt;</code>
Immediately kills the browser process.

Emits 'browserClosed' event.


* * *

<a name="BrowserController+setCookies"></a>

#### `browserController.setCookies(page, cookies)` ⇒ <code>Promise.&lt;void&gt;</code>

| Param | Type |
| --- | --- |
| page | <code>Object</code> |
| cookies | <code>Array.&lt;object&gt;</code> |


* * *

<a name="BrowserController+getCookies"></a>

#### `browserController.getCookies(page)` ⇒ <code>Promise.&lt;Array.&lt;object&gt;&gt;</code>

| Param | Type |
| --- | --- |
| page | <code>Object</code> |


* * *

<a name="BrowserPlugin"></a>

### BrowserPlugin
The `BrowserPlugin` serves two purposes. First, it is the base class that
specialized controllers like `PuppeteerPlugin` or `PlaywrightPlugin` extend.
Second, it allows the user to configure the automation libraries and
feed them to [BrowserPool](#BrowserPool) for use.

**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [useIncognitoPages] | <code>boolean</code> | <code>false</code> | By default pages share the same browser context.  If set to true each page uses its own context that is destroyed once the page is closed or crashes. |
| [userDataDir] | <code>object</code> |  | Path to a User Data Directory, which stores browser session data like cookies and local storage. |


* * *

<a name="new_BrowserPlugin_new"></a>

#### `new BrowserPlugin(library, [options])`

| Param | Type | Description |
| --- | --- | --- |
| library | <code>object</code> | Each plugin expects an instance of the object with the `.launch()` property.  For Puppeteer, it is the `puppeteer` module itself, whereas for Playwright  it is one of the browser types, such as `puppeteer.chromium`.  `BrowserPlugin` does not include the library. You can choose any version  or fork of the library. It also keeps `@crawlee/browser-pool` installation small. |
| [options] | <code>object</code> |  |
| [options.launchOptions] | <code>object</code> | Options that will be passed down to the automation library. E.g.  `puppeteer.launch(launchOptions);`. This is a good place to set  options that you want to apply as defaults. To dynamically override  those options per-browser, see the `preLaunchHooks` of [BrowserPool](#BrowserPool). |
| [options.proxyUrl] | <code>string</code> | Automation libraries configure proxies differently. This helper allows you  to set a proxy URL without worrying about specific implementations.  It also allows you use an authenticated proxy without extra code. |


* * *

<a name="LaunchContext"></a>

### LaunchContext
`LaunchContext` holds information about the launched browser. It's useful
to retrieve the `launchOptions`, the proxy the browser was launched with
or any other information user chose to add to the `LaunchContext` by calling
its `extend` function. This is very useful to keep track of browser-scoped
values, such as session IDs.

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | To make identification of `LaunchContext` easier, `BrowserPool` assigns  the `LaunchContext` an `id` that's equal to the `id` of the page that  triggered the browser launch. This is useful, because many pages share  a single launch context (single browser). |
| browserPlugin | [<code>BrowserPlugin</code>](#BrowserPlugin) | The `BrowserPlugin` instance used to launch the browser. |
| launchOptions | <code>object</code> | The actual options the browser was launched with, after changes.  Those changes would be typically made in pre-launch hooks. |
| [useIncognitoPages] | <code>boolean</code> | By default pages share the same browser context.  If set to true each page uses its own context that is destroyed once the page is closed or crashes. |
| [userDataDir] | <code>object</code> | Path to a User Data Directory, which stores browser session data like cookies and local storage. |


* [LaunchContext](#LaunchContext)
    * [`.proxyUrl`](#LaunchContext+proxyUrl)
    * [`.proxyUrl`](#LaunchContext+proxyUrl) ⇒ <code>string</code>
    * [`.extend(fields)`](#LaunchContext+extend)


* * *

<a name="LaunchContext+proxyUrl"></a>

#### `launchContext.proxyUrl`
Sets a proxy URL for the browser.
Use `undefined` to unset existing proxy URL.


| Param | Type |
| --- | --- |
| url | <code>string</code> |


* * *

<a name="LaunchContext+proxyUrl"></a>

#### `launchContext.proxyUrl` ⇒ <code>string</code>
Returns the proxy URL of the browser.


* * *

<a name="LaunchContext+extend"></a>

#### `launchContext.extend(fields)`
Extend the launch context with any extra fields.
This is useful to keep state information relevant
to the browser being launched. It ensures that
no internal fields are overridden and should be
used instead of property assignment.


| Param | Type |
| --- | --- |
| fields | <code>object</code> |


* * *


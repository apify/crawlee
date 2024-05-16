# Browser Pool—the headless browser manager

Browser Pool is a small, but powerful and extensible library, that allows you to seamlessly control multiple headless browsers at the same time with only a little configuration, and a single function call. Currently, it supports [Puppeteer](https://github.com/puppeteer/puppeteer), [Playwright](https://github.com/microsoft/playwright), and it can be easily extended with plugins.

We created Browser Pool because we regularly needed to execute tasks concurrently in many headless browsers and their pages, but we did not want to worry about launching browsers, closing browsers, restarting them after crashes and so on. We also wanted to easily and reliably manage the whole browser/page lifecycle.

You can use Browser Pool for scraping the internet at scale, testing your website in multiple browsers at the same time or launching web automation robots.

## Installation

Use NPM or Yarn to install `@crawlee/browser-pool`. Note that `@crawlee/browser-pool` does not come preinstalled with browser automation libraries. This allows you to choose your own libraries and their versions, and it also makes `@crawlee/browser-pool` much smaller.

Run this command to install `@crawlee/browser-pool` and the `playwright` browser automation library.

```bash
npm install @crawlee/browser-pool playwright
```

## Usage

This simple example shows how to open a page in a browser using Browser Pool. We use the provided `PlaywrightPlugin` to wrap a Playwright installation of your own. By calling `browserPool.newPage()` you launch a new Firefox browser and open a new page in that browser.

```js
import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import playwright from 'playwright';

const browserPool = new BrowserPool({
    browserPlugins: [new PlaywrightPlugin(playwright.chromium)],
});

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
```

## Launching multiple browsers

The basic example shows how to launch a single browser, but the purpose of Browser Pool is to launch many browsers. This is done automatically in the background. You only need to provide the relevant plugins and call `browserPool.newPage()`.

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

// Open 4 pages in 3 browsers. The browsers are launched
// in a round-robin fashion based on the plugin order.
const chromiumPage = await browserPool.newPage();
const firefoxPage = await browserPool.newPage();
const webkitPage = await browserPool.newPage();
const chromiumPage2 = await browserPool.newPage();

// Don't forget to close pages / destroy pool when you're done.
```

This round-robin way of opening pages may not be useful for you, if you need to consistently run tasks in multiple environments. For that, there's the `newPageWithEachPlugin` function.

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

const pages = await browserPool.newPageWithEachPlugin();
const promises = pages.map(async page => {
    // Run some task with each page
    // pages are in order of plugins:
    // [playwrightPage, puppeteerPage]
    await page.close();
});
await Promise.all(promises);

// Continue with some more work.
```

## Features

Besides a simple interface for launching browsers, Browser Pool includes other helpful features that make browser management more convenient.

### Simple configuration

You can easily set the maximum number of pages that can be open in a given browser and also the maximum number of pages to process before a browser [is retired](#graceful-browser-closing).

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

When scraping at scale or testing websites from multiple geolocations, one often needs to use proxy servers. Setting up an authenticated proxy in Puppeteer can be cumbersome, so we created a helper that does all the heavy lifting for you. Simply provide a proxy URL with authentication credentials, and you're done. It works the same for Playwright too.

```js
const puppeteerPlugin = new PuppeteerPlugin(puppeteer, {
    proxyUrl: 'http://<username>:<password>@proxy.com:8000'
});
```

> We plan to extend this by adding a proxy-per-page functionality, allowing you to rotate proxies per page, rather than per browser.

### Lifecycle management with hooks

Browser Pool allows you to manage the full browser / page lifecycle by attaching hooks to the most important events. Asynchronous hooks are supported, and their execution order is guaranteed.

The first parameter of each hook is either a `pageId` for the hooks executed before a `page` is created or a `page` afterward. This is useful to keep track of which hook was triggered by which `newPage()` call.

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

Playwright allows customizing multiple browser attributes by browser context. You can customize some of them once the context is created, but some need to be customized within its creation. This part of the documentation should explain how you can effectively customize the browser context.

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

// Launches Chromium with Playwright and returns a Playwright Page.
const page = await browserPool.newPage({
    pageOptions: {
        // context options
        deviceScaleFactor: 2,
        colorScheme: 'light',
        locale: 'de-DE',
    },
});

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

// Launches Chromium with Playwright and returns a Playwright Page.
const page = await browserPool.newPage();
```

### Single API for common operations

Puppeteer and Playwright handle some things differently. Browser Pool attempts to remove those differences for the most common use-cases.

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

With Browser Pool, browsers are not closed, but retired. A retired browser will no longer open new pages, but it will wait until the open pages are closed, allowing your running tasks to finish. If a browser gets stuck in limbo, it will be killed after a timeout to prevent hanging browser processes.

### Changing browser fingerprints a.k.a. browser signatures

> Fingerprints are enabled by default since v3.

Changing browser fingerprints is beneficial for avoiding getting blocked and simulating real user browsers. With Browser Pool, you can do this otherwise complicated technique by enabling the `useFingerprints` option. The fingerprints are by default tied to the respective proxy urls to not use the same unique fingerprint from various IP addresses. You can disable this behavior in the [`fingerprintOptions`](/api/browser-pool/interface/FingerprintOptions). In the `fingerprintOptions`, You can also control which fingerprints are generated. You can control parameters as browser, operating system, and browser versions.

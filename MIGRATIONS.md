# Migration from 1.x.x to 2.0.0
There should be no changes needed apart from upgrading your Node.js version to >= 15.10. If you encounter issues with `cheerio`, [read their CHANGELOG](https://github.com/cheeriojs/cheerio/releases). We bumped it from `rc.3` to `rc.10`.

# Migration from 0.2x.x to 1.0.0
There are a lot of breaking changes in the v1.0.0 release, but we're confident that
updating your code will be a matter of minutes. Below, you'll find examples how to do it
and also short tutorials how to use many of the new features.

If you hadn't yet, we suggest reading the [CHANGELOG](https://github.com/apify/apify-js/blob/master/CHANGELOG.md)
for a high level view of the changes.

> Many of the new features are made with power users in mind,
> so don't worry if something looks complicated. You don't need to use it.

<!-- toc -->

- [Installation](#installation)
- [Running on Apify Platform](#running-on-apify-platform)
- [Handler arguments are now Crawling Context](#handler-arguments-are-now-crawling-context)
  * [`Map` of crawling contexts and their IDs](#map-of-crawling-contexts-and-their-ids)
  * [`autoscaledPool` was moved under `crawlingContext.crawler`](#autoscaledpool-was-moved-under-crawlingcontextcrawler)
- [Replacement of `PuppeteerPool` with `BrowserPool`](#replacement-of-puppeteerpool-with-browserpool)
  * [Access to running `BrowserPool`](#access-to-running-browserpool)
  * [Pages now have IDs](#pages-now-have-ids)
  * [Configuration and lifecycle hooks](#configuration-and-lifecycle-hooks)
  * [Introduction of `BrowserController`](#introduction-of-browsercontroller)
  * [`BrowserPool` methods vs `PuppeteerPool`](#browserpool-methods-vs-puppeteerpool)
- [Updated `PuppeteerCrawlerOptions`](#updated-puppeteercrawleroptions)
  * [Removal of `gotoFunction`](#removal-of-gotofunction)
  * [`launchPuppeteerOptions` => `launchContext`](#launchpuppeteeroptions--launchcontext)
  * [Removal of `launchPuppeteerFunction`](#removal-of-launchpuppeteerfunction)
- [Launch functions](#launch-functions)
  * [Updated arguments](#updated-arguments)
  * [Custom modules](#custom-modules)

<!-- tocstop -->

## Installation
Previous versions of the SDK bundled the `puppeteer` package, so you did not have to install
it. SDK v1 supports also `playwright` and we don't want to force users to install both.
To install SDK v1 with Puppeteer (same as previous versions), run:

```bash
npm install apify puppeteer
```

To install SDK v1 with Playwright run:
```bash
npm install apify playwright
```

> While we tried to add the most important functionality in the initial release,
> you may find that there are still some utilities or options that are only
> supported by Puppeteer and not Playwright.

## Running on Apify Platform
If you want to make use of Playwright on the Apify Platform, you need to use a Docker image
that supports Playwright. We've created them for you, so head over to the new
[Docker image guide](https://sdk.apify.com/docs/guides/docker-images) and pick the one
that best suits your needs.

Note that your `package.json` **MUST** include `puppeteer` and/or `playwright` as dependencies.
If you don't list them, the libraries will be uninstalled from your `node_modules` folder
when you build your actors.

## Handler arguments are now Crawling Context
Previously, arguments of user provided handler functions were provided in separate
objects. This made it difficult to track values across function invocations.

```js
const handlePageFunction = async (args1) => {
    args1.hasOwnProperty('proxyInfo') // true
}

const handleFailedRequestFunction = async (args2) => {
    args2.hasOwnProperty('proxyInfo') // false
}

args1 === args2 // false
```

This happened because a new arguments object was created for each function.
With SDK v1 we now have a single object called Crawling Context.

```js
const handlePageFunction = async (crawlingContext1) => {
    crawlingContext1.hasOwnProperty('proxyInfo') // true
}

const handleFailedRequestFunction = async (crawlingContext2) => {
    crawlingContext2.hasOwnProperty('proxyInfo') // true
}

// All contexts are the same object.
crawlingContext1 === crawlingContext2 // true
```

### `Map` of crawling contexts and their IDs
Now that all the objects are the same, we can keep track of all running crawling contexts.
We can do that by working with the new `id` property of `crawlingContext`
This is useful when you need cross-context access.

```js
let masterContextId;
const handlePageFunction = async ({ id, page, request, crawler }) => {
    if (request.userData.masterPage) {
        masterContextId = id;
        // Prepare the master page.
    } else {
        const masterContext = crawler.crawlingContexts.get(masterContextId);
        const masterPage = masterContext.page;
        const masterRequest = masterContext.request;
        // Now we can manipulate the master data from another handlePageFunction.
    }
}
```

### `autoscaledPool` was moved under `crawlingContext.crawler`
To prevent bloat and to make access to certain key objects easier, we exposed a `crawler`
property on the handle page arguments.

```js
const handePageFunction = async ({ request, page, crawler }) => {
    await crawler.requestQueue.addRequest({ url: 'https://example.com' });
    await crawler.autoscaledPool.pause();
}
```

This also means that some shorthands like `puppeteerPool` or `autoscaledPool` were
no longer necessary.

```js
const handePageFunction = async (crawlingContext) => {
    crawlingContext.autoscaledPool // does NOT exist anymore
    crawlingContext.crawler.autoscaledPool // <= this is correct usage
}
```

## Replacement of `PuppeteerPool` with `BrowserPool`
`BrowserPool` was created to extend `PuppeteerPool` with the ability to manage other
browser automation libraries. The API is similar, but not the same.

### Access to running `BrowserPool`
Only `PuppeteerCrawler` and `PlaywrightCrawler` use `BrowserPool`. You can access it
on the `crawler` object.

```js
const crawler = new Apify.PlaywrightCrawler({
    handlePageFunction: async ({ page, crawler }) => {
        crawler.browserPool // <-----
    }
});

crawler.browserPool // <-----
```

### Pages now have IDs
And they're equal to `crawlingContext.id` which gives you access to full `crawlingContext`
in hooks. See [Lifecycle hooks](#configuration-and-lifecycle-hooks) below.

```js
const pageId = browserPool.getPageId
```

### Configuration and lifecycle hooks
The most important addition with `BrowserPool` are the
[lifecycle hooks](https://github.com/apify/browser-pool#browserpool).
You can access them via `browserPoolOptions` in both crawlers. A full list of `browserPoolOptions`
can be found in [`browser-pool` readme](https://github.com/apify/browser-pool#new-browserpooloptions).

```js
const crawler = new Apify.PuppeteerCrawler({
    browserPoolOptions: {
        retireBrowserAfterPageCount: 10,
        preLaunchHooks: [
            async (pageId, launchContext) => {
                const { request } = crawler.crawlingContexts.get(pageId);
                if (request.userData.useHeadful === true) {
                    launchContext.launchOptions.headless = false;
                }
            }
        ]
    }
})
```

### Introduction of `BrowserController`
[`BrowserController`](https://github.com/apify/browser-pool#browsercontroller)
is a class of `browser-pool` that's responsible for browser management.
Its purpose is to provide a single API for working with both Puppeteer and Playwright browsers.
It works automatically in the background, but if you ever wanted to close a browser properly,
you should use a `browserController` to do it. You can find it in the handle page arguments.

```js
const handlePageFunction = async ({ page, browserController }) => {
    // Wrong usage. Could backfire because it bypasses BrowserPool.
    page.browser().close();

    // Correct usage. Allows graceful shutdown.
    browserController.close();

    const cookies = [/* some cookie objects */];
    // Wrong usage. Will only work in Puppeteer and not Playwright.
    page.setCookies(...cookies);

    // Correct usage. Will work in both.
    browserController.setCookies(page, cookies);
}
```

The `BrowserController` also includes important information about the browser, such as
the context it was launched with. This was difficult to do before SDK v1.

```js
const handlePageFunction = async ({ browserController }) => {
    // Information about the proxy used by the browser
    browserController.launchContext.proxyInfo

    // Session used by the browser
    browserController.launchContext.session
}
```

### `BrowserPool` methods vs `PuppeteerPool`
Some functions were removed (in line with earlier deprecations), and some were changed a bit:

```js
// OLD
puppeteerPool.recyclePage(page);

// NEW
page.close();
```

```js
// OLD
puppeteerPool.retire(page.browser());

// NEW
browserPool.retireBrowserByPage(page);
```

```js
// OLD
puppeteerPool.serveLiveViewSnapshot();

// NEW
// There's no LiveView in BrowserPool
```

## Updated `PuppeteerCrawlerOptions`
To keep `PuppeteerCrawler` and `PlaywrightCrawler` consistent, we updated the options.

### Removal of `gotoFunction`
The concept of a configurable `gotoFunction` is not ideal. Especially since we use a modified
`gotoExtended`. Users have to know this when they override `gotoFunction` if they want to
extend default behavior. We decided to replace `gotoFunction` with `preNavigationHooks` and
`postNavigationHooks`.

The following example illustrates how `gotoFunction` makes things complicated.
```js
const gotoFunction = async ({ request, page }) => {
    // pre-processing
    await makePageStealthy(page);

    // Have to remember how to do this:
    const response = gotoExtended(page, request, {/* have to remember the defaults */});

    // post-processing
    await page.evaluate(() => {
        window.foo = 'bar';
    });

    // Must not forget!
    return response;
}

const crawler = new Apify.PuppeteerCrawler({
    gotoFunction,
    // ...
})
```

With `preNavigationHooks` and `postNavigationHooks` it's much easier. `preNavigationHooks`
are called with two arguments: `crawlingContext` and `gotoOptions`. `postNavigationHooks`
are called only with `crawlingContext`.

```js
const preNavigationHooks = [
    async ({ page }) => makePageStealthy(page)
];

const postNavigationHooks = [
    async ({ page }) => page.evaluate(() => {
        window.foo = 'bar'
    })
]

const crawler = new Apify.PuppeteerCrawler({
    preNavigationHooks,
    postNavigationHooks,
    // ...
})
```

### `launchPuppeteerOptions` => `launchContext`
Those were always a point of confusion because they merged custom Apify options with
`launchOptions` of Puppeteer.

```js
const launchPuppeteerOptions = {
    useChrome: true, // Apify option
    headless: false, // Puppeteer option
}
```

Use the new `launchContext` object, which explicitly defines `launchOptions`.
`launchPuppeteerOptions` were removed.

```js
const crawler = new Apify.PuppeteerCrawler({
    launchContext: {
        useChrome: true, // Apify option
        launchOptions: {
            headless: false // Puppeteer option
        }
    }
})
```

> LaunchContext is also a type of [`browser-pool`](https://github.com/apify/browser-pool) and
> the structure is exactly the same there. SDK only adds extra options.

### Removal of `launchPuppeteerFunction`
`browser-pool` introduces the idea of [lifecycle hooks](https://github.com/apify/browser-pool#browserpool),
which are functions that are executed when a certain event in the browser lifecycle happens.

```js
const launchPuppeteerFunction = async (launchPuppeteerOptions) => {
    if (someVariable === 'chrome') {
        launchPuppeteerOptions.useChrome = true;
    }
    return Apify.launchPuppeteer(launchPuppeteerOptions);
}

const crawler = new Apify.PuppeteerCrawler({
    launchPuppeteerFunction,
    // ...
})
```

Now you can recreate the same functionality with a `preLaunchHook`:

```js
const maybeLaunchChrome = (pageId, launchContext) => {
    if (someVariable === 'chrome') {
        launchContext.useChrome = true;
    }
}

const crawler = new Apify.PuppeteerCrawler({
    browserPoolOptions: {
        preLaunchHooks: [maybeLaunchChrome]
    },
    // ...
})
```

This is better in multiple ways. It is consistent across both Puppeteer and Playwright.
It allows you to easily construct your browsers with pre-defined behavior:

```js
const preLaunchHooks = [
    maybeLaunchChrome,
    useHeadfulIfNeeded,
    injectNewFingerprint,
]
```

And thanks to the addition of [`crawler.crawlingContexts`](#handler-arguments-are-now-crawling-context)
the functions also have access to the `crawlingContext` of the `request` that triggered the launch.

```js
const preLaunchHooks = [
    async function maybeLaunchChrome(pageId, launchContext) {
        const { request } = crawler.crawlingContexts.get(pageId);
        if (request.userData.useHeadful === true) {
            launchContext.launchOptions.headless = false;
        }
    }
]
```

## Launch functions
In addition to `Apify.launchPuppeteer()` we now also have `Apify.launchPlaywright()`.

### Updated arguments
We [updated the launch options object](#launchpuppeteeroptions--launchcontext) because
it was a frequent source of confusion.

```js
// OLD
await Apify.launchPuppeteer({
    useChrome: true,
    headless: true,
})

// NEW
await Apify.launchPuppeteer({
    useChrome: true,
    launchOptions: {
        headless: true,
    }
})
```

### Custom modules
`Apify.launchPuppeteer` already supported the `puppeteerModule` option. With Playwright,
we normalized the name to `launcher` because the `playwright` module itself does not
launch browsers.

```js
const puppeteer = require('puppeteer');
const playwright = require('playwright');

await Apify.launchPuppeteer();
// Is the same as:
await Apify.launchPuppeteer({
    launcher: puppeteer
})

await Apify.launchPlaywright();
// Is the same as:
await Apify.launchPlaywright({
    launcher: playwright.chromium
})
```

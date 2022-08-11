---
id: upgrading-to-v1
title: Upgrading to v1
---

## Summary
After 3.5 years of rapid development and a lot of breaking changes and deprecations,
here comes the result - **Apify SDK v1**. There were two goals for this release. **Stability**
and **adding support for more browsers** - Firefox and Webkit (Safari).

The SDK has grown quite popular over the years, powering thousands of web scraping
and automation projects. We think our developers deserve a stable environment to work
in and by releasing SDK v1, **we commit to only make breaking changes once a year,
with a new major release**.

We added support for more browsers by replacing `PuppeteerPool` with
[`browser-pool`](https://github.com/apify/browser-pool). A new library that we created
specifically for this purpose. It builds on the ideas from `PuppeteerPool` and extends
them to support [Playwright](https://github.com/microsoft/playwright). Playwright is
a browser automation library similar to Puppeteer. It works with all well known browsers
and uses almost the same interface as Puppeteer, while adding useful features and simplifying
common tasks. Don't worry, you can still use Puppeteer with the new `BrowserPool`.

A large breaking change is that neither `puppeteer` nor `playwright` are bundled with
the SDK v1. To make the choice of a library easier and installs faster, users will
have to install the selected modules and versions themselves. This allows us to add
support for even more libraries in the future.

Thanks to the addition of Playwright we now have a `PlaywrightCrawler`. It is very similar
to `PuppeteerCrawler` and you can pick the one you prefer. It also means we needed to make
some interface changes. The `launchPuppeteerFunction` option of `PuppeteerCrawler` is gone
and `launchPuppeteerOptions` were replaced by `launchContext`. We also moved things around
in the `handlePageFunction` arguments. See the
[migration guide](#migration-guide)
for more detailed explanation and migration examples.

What's in store for SDK v2? We want to split the SDK into smaller libraries,
so that everyone can install only the things they need. We plan a TypeScript migration
to make crawler development faster and safer. Finally, we will take a good look
at the interface of the whole SDK and update it to improve the developer experience.
Bug fixes and scraping features will of course keep landing in versions 1.X as well.

## Migration Guide
There are a lot of breaking changes in the v1.0.0 release, but we're confident that
updating your code will be a matter of minutes. Below, you'll find examples how to do it
and also short tutorials how to use many of the new features.

> Many of the new features are made with power users in mind,
> so don't worry if something looks complicated. You don't need to use it.

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
    await page.browser().close();

    // Correct usage. Allows graceful shutdown.
    await browserController.close();

    const cookies = [/* some cookie objects */];
    // Wrong usage. Will only work in Puppeteer and not Playwright.
    await page.setCookies(...cookies);

    // Correct usage. Will work in both.
    await browserController.setCookies(page, cookies);
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
await puppeteerPool.recyclePage(page);

// NEW
await page.close();
```

```js
// OLD
await puppeteerPool.retire(page.browser());

// NEW
browserPool.retireBrowserByPage(page);
```

```js
// OLD
await puppeteerPool.serveLiveViewSnapshot();

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
    const response = await gotoExtended(page, request, {/* have to remember the defaults */});

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

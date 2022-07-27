# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.0.1](https://github.com/apify/crawlee/compare/v3.0.0...v3.0.1) (2022-07-26)

### Fixes

* remove `JSONData` generic type arg from `CheerioCrawler` in ([#1402](https://github.com/apify/crawlee/pull/1402))
* rename default storage folder to just `storage` in ([#1403](https://github.com/apify/crawlee/pull/1403))
* remove trailing slash for proxyUrl in ([#1405](https://github.com/apify/crawlee/pull/1405))
* run browser crawlers in headless mode by default in ([#1409](https://github.com/apify/crawlee/pull/1409))
* rename interface `FailedRequestHandler` to `ErrorHandler` in ([#1410](https://github.com/apify/crawlee/pull/1410))
* ensure default route is not ignored in `CheerioCrawler` in ([#1411](https://github.com/apify/crawlee/pull/1411))
* add `headless` option to `BrowserCrawlerOptions` in ([#1412](https://github.com/apify/crawlee/pull/1412))
* processing custom cookies in ([#1414](https://github.com/apify/crawlee/pull/1414))
* enqueue link not finding relative links if the checked page is redirected in ([#1416](https://github.com/apify/crawlee/pull/1416))
* fix building projects with TS when puppeteer and playwright are not installed in ([#1404](https://github.com/apify/crawlee/pull/1404))
* calling `enqueueLinks` in browser crawler on page without any links in ([385ca27](https://github.com/apify/crawlee/commit/385ca27c4c50096f2e28bf0da369d6aaf849a73b))
* improve error message when no default route provided in ([04c3b6a](https://github.com/apify/crawlee/commit/04c3b6ac2fd151379d57e95bde085e2a098d1b76))

### Features

* feat: add parseWithCheerio for puppeteer & playwright in ([#1418](https://github.com/apify/crawlee/pull/1418))


## [3.0.0](https://github.com/apify/crawlee/compare/v2.3.2...v3.0.0) (2022-07-13)

This section summarizes most of the breaking changes between Crawlee (v3) and Apify SDK (v2). Crawlee is the spiritual successor to Apify SDK, so we decided to keep the versioning and release Crawlee as v3.

### Crawlee vs Apify SDK

Up until version 3 of `apify`, the package contained both scraping related tools and Apify platform related helper methods. With v3 we are splitting the whole project into two main parts:

- Crawlee, the new web-scraping library, available as `crawlee` package on NPM
- Apify SDK, helpers for the Apify platform, available as `apify` package on NPM

Moreover, the Crawlee library is published as several packages under `@crawlee` namespace:

- `@crawlee/core`: the base for all the crawler implementations, also contains things like `Request`, `RequestQueue`, `RequestList` or `Dataset` classes
- `@crawlee/basic`: exports `BasicCrawler`
- `@crawlee/cheerio`: exports `CheerioCrawler`
- `@crawlee/browser`: exports `BrowserCrawler` (which is used for creating `@crawlee/playwright` and `@crawlee/puppeteer`)
- `@crawlee/playwright`: exports `PlaywrightCrawler`
- `@crawlee/puppeteer`: exports `PuppeteerCrawler`
- `@crawlee/memory-storage`: `@apify/storage-local` alternative
- `@crawlee/browser-pool`: previously `browser-pool` package
- `@crawlee/utils`: utility methods
- `@crawlee/types`: holds TS interfaces mainly about the `StorageClient`

#### Installing Crawlee

> As Crawlee is not yet released as `latest`, we need to install from the `next` distribution tag!

Most of the Crawlee packages are extending and reexporting each other, so it's enough to install just the one you plan on using, e.g. `@crawlee/playwright` if you plan on using `playwright` - it already contains everything from the `@crawlee/browser` package, which includes everything from `@crawlee/basic`, which includes everything from `@crawlee/core`.

```bash
npm install crawlee@next
```

Or if all we need is cheerio support, we can install only @crawlee/cheerio

```bash
npm install @crawlee/cheerio@next
```

When using `playwright` or `puppeteer`, we still need to install those dependencies explicitly - this allows the users to be in control of which version will be used.

```bash
npm install crawlee@next playwright
# or npm install @crawlee/playwright@next playwright
```

Alternatively we can also use the `crawlee` meta-package which contains (re-exports) most of the `@crawlee/*` packages, and therefore contains all the crawler classes.

> Sometimes you might want to use some utility methods from `@crawlee/utils`, so you might want to install that as well. This package contains some utilities that were previously available under `Apify.utils`. Browser related utilities can be also found in the crawler packages (e.g. `@crawlee/playwright`).

### Full TypeScript support

Both Crawlee and Apify SDK are full TypeScript rewrite, so they include up-to-date types in the package. For your TypeScript crawlers we recommend using our predefined TypeScript configuration from `@apify/tsconfig` package. Don't forget to set the `module` and `target` to `ES2022` or above to be able to use top level await.

> The `@apify/tsconfig` config has [`noImplicitAny`](https://www.typescriptlang.org/tsconfig#noImplicitAny) enabled, you might want to disable it during the initial development as it will cause build failures if you left some unused local variables in your code.

```json title="tsconfig.json"
{
    "extends": "@apify/tsconfig",
    "compilerOptions": {
        "module": "ES2022",
        "target": "ES2022",
        "outDir": "dist",
        "lib": ["DOM"]
    },
    "include": [
        "./src/**/*"
    ]
}
```

#### Docker build

For `Dockerfile` we recommend using multi-stage build, so you don't install the dev dependencies like TypeScript in your final image:

```dockerfile title="Dockerfile"
# using multistage build, as we need dev deps to build the TS source code
FROM apify/actor-node:16 AS builder

# copy all files, install all dependencies (including dev deps) and build the project
COPY . ./
RUN npm install --include=dev \
    && npm run build

# create final image
FROM apify/actor-node:16
# copy only necessary files
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/README.md ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/apify.json ./apify.json
COPY --from=builder /usr/src/app/INPUT_SCHEMA.json ./INPUT_SCHEMA.json

# install only prod deps
RUN npm --quiet set progress=false \
    && npm install --only=prod --no-optional \
    && echo "Installed NPM packages:" \
    && (npm list --only=prod --no-optional --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# run compiled code
CMD npm run start:prod
```

### Browser fingerprints

Previously we had a magical `stealth` option in the puppeteer crawler that enabled several tricks aiming to mimic the real users as much as possible. While this worked to a certain degree, we decided to replace it with generated browser fingerprints.

In case we don't want to have dynamic fingerprints, we can disable this behaviour via `useFingerprints` in `browserPoolOptions`:

 ```ts
const crawler = new PlaywrightCrawler({
    browserPoolOptions: {
        useFingerprints: false,
    },
});
 ```

### Session cookie method renames

Previously, if we wanted to get or add cookies for the session that would be used for the request, we had to call `session.getPuppeteerCookies()` or `session.setPuppeteerCookies()`. Since this method could be used for any of our crawlers, not just `PuppeteerCrawler`, the methods have been renamed to `session.getCookies()` and `session.setCookies()` respectively. Otherwise, their usage is exactly the same!

### Memory storage

When we store some data or intermediate state (like the one `RequestQueue` holds), we now use `@crawlee/memory-storage` by default. It is an alternative to the `@apify/storage-local`, that stores the state inside memory (as opposed to SQLite database used by `@apify/storage-local`). While the state is stored in memory, it also dumps it to the file system, so we can observe it, as well as respects the existing data stored in KeyValueStore (e.g. the `INPUT.json` file).

When we want to run the crawler on Apify platform, we need to use `Actor.init` or `Actor.main`, which will automatically switch the storage client to `ApifyClient` when on the Apify platform.

We can still use the `@apify/storage-local`, to do it, first install it pass it to the `Actor.init` or `Actor.main` options:

> `@apify/storage-local` v2.1.0+ is required for Crawlee

```ts
import { Actor } from 'apify';
import { ApifyStorageLocal } from '@apify/storage-local';

const storage = new ApifyStorageLocal(/* options like `enableWalMode` belong here */);
await Actor.init({ storage });
```

### Purging of the default storage

Previously the state was preserved between local runs, and we had to use `--purge` argument of the `apify-cli`. With Crawlee, this is now the default behaviour, we purge the storage automatically on `Actor.init/main` call. We can opt out of it via `purge: false` in the `Actor.init` options.

### Renamed crawler options and interfaces

Some options were renamed to better reflect what they do. We still support all the old parameter names too, but not at the TS level.

* `handleRequestFunction` -> `requestHandler`
* `handlePageFunction` -> `requestHandler`
* `handleRequestTimeoutSecs` -> `requestHandlerTimeoutSecs`
* `handlePageTimeoutSecs` -> `requestHandlerTimeoutSecs`
* `requestTimeoutSecs` -> `navigationTimeoutSecs`
* `handleFailedRequestFunction` -> `failedRequestHandler`

We also renamed the crawling context interfaces, so they follow the same convention and are more meaningful:

* `CheerioHandlePageInputs` -> `CheerioCrawlingContext`
* `PlaywrightHandlePageFunction` -> `PlaywrightCrawlingContext`
* `PuppeteerHandlePageFunction` -> `PuppeteerCrawlingContext`

### Context aware helpers

Some utilities previously available under `Apify.utils` namespace are now moved to the crawling context and are _context aware_. This means they have some parameters automatically filled in from the context, like the current `Request` instance or current `Page` object, or the `RequestQueue` bound to the crawler.

#### Enqueuing links

One common helper that received more attention is the `enqueueLinks`. As mentioned above, it is context aware - we no longer need pass in the `requestQueue` or `page` arguments (or the cheerio handle `$`). In addition to that, it now offers 3 enqueuing strategies:

* `EnqueueStrategy.All` (`'all'`): Matches any URLs found
* `EnqueueStrategy.SameHostname` (`'same-hostname'`) Matches any URLs that have the same subdomain as the base URL (default)
* `EnqueueStrategy.SameDomain` (`'same-domain'`) Matches any URLs that have the same domain name. For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of `https://example.com`.

This means we can even call `enqueueLinks()` without any parameters. By default, it will go through all the links found on current page and filter only those targeting the same subdomain.

Moreover, we can specify patterns the URL should match via globs:

```ts
const crawler = new PlaywrightCrawler({
    async requestHandler({ enqueueLinks }) {
        await enqueueLinks({
            globs: ['https://apify.com/*/*'],
            // we can also use `regexps` and `pseudoUrls` keys here
        });
    },
});
```

### Implicit `RequestQueue` instance

All crawlers now have the `RequestQueue` instance automatically available via `crawler.getRequestQueue()` method. It will create the instance for you if it does not exist yet. This mean we no longer need to create the `RequestQueue` instance manually, and we can just use `crawler.addRequests()` method described underneath.

> We can still create the `RequestQueue` explicitly, the `crawler.getRequestQueue()` method will respect that and return the instance provided via crawler options.

### `crawler.addRequests()`

We can now add multiple requests in batches. The newly added `addRequests` method will handle everything for us. It enqueues the first 1000 requests and resolves, while continuing with the rest in the background, again in a smaller 1000 items batches, so we don't fall into any API rate limits. This means the crawling will start almost immediately (within few seconds at most), something previously possible only with a combination of `RequestQueue` and `RequestList`.

```ts
// will resolve right after the initial batch of 1000 requests is added
const result = await crawler.addRequests([/* many requests, can be even millions */]);

// if we want to wait for all the requests to be added, we can await the `waitForAllRequestsToBeAdded` promise
await result.waitForAllRequestsToBeAdded;
```

### Less verbose error logging

Previously an error thrown from inside request handler resulted in full error object being logged. With Crawlee, we log only the error message as a warning as long as we know the request will be retried. If you want to enable verbose logging like in v2, use the `CRAWLEE_VERBOSE_LOG` env var.

### Removal of `requestAsBrowser`

In v1 we replaced the underlying implementation of `requestAsBrowser` to be just a proxy over calling [`got-scraping`](https://github.com/apify/got-scraping) - our custom extension to `got` that tries to mimic the real browsers as much as possible. With v3, we are removing the `requestAsBrowser`, encouraging the use of [`got-scraping`](https://github.com/apify/got-scraping) directly.

For easier migration, we also added `context.sendRequest()` helper that allows processing the context bound `Request` object through [`got-scraping`](https://github.com/apify/got-scraping):

```ts
const crawler = new BasicCrawler({
    async requestHandler({ sendRequest, log }) {
        // we can use the options parameter to override gotScraping options
        const res = await sendRequest({ responseType: 'json' });
        log.info('received body', res.body);
    },
});
```

#### How to use `sendRequest()`?

See [the Got Scraping guide](../guides/got_scraping.mdx).

#### Removed options

The `useInsecureHttpParser` option has been removed. It's permanently set to `true` in order to better mimic browsers' behavior.

Got Scraping automatically performs protocol negotiation, hence we removed the `useHttp2` option. It's set to `true` - 100% of browsers nowadays are capable of HTTP/2 requests. Oh, more and more of the web is using it too!

#### Renamed options

In the `requestAsBrowser` approach, some of the options were named differently. Here's a list of renamed options:

##### `payload`

This options represents the body to send. It could be a `string` or a `Buffer`. However, there is no `payload` option anymore. You need to use `body` instead. Or, if you wish to send JSON, `json`. Here's an example:

```ts
// Before:
await Apify.utils.requestAsBrowser({ …, payload: 'Hello, world!' });
await Apify.utils.requestAsBrowser({ …, payload: Buffer.from('c0ffe', 'hex') });
await Apify.utils.requestAsBrowser({ …, json: { hello: 'world' } });

// After:
await gotScraping({ …, body: 'Hello, world!' });
await gotScraping({ …, body: Buffer.from('c0ffe', 'hex') });
await gotScraping({ …, json: { hello: 'world' } });
```

##### `ignoreSslErrors`

It has been renamed to `https.rejectUnauthorized`. By default, it's set to `false` for convenience. However, if you want to make sure the connection is secure, you can do the following:

```ts
// Before:
await Apify.utils.requestAsBrowser({ …, ignoreSslErrors: false });

// After:
await gotScraping({ …, https: { rejectUnauthorized: true } });
```

Please note: the meanings are opposite! So we needed to invert the values as well.

##### `header-generator` options

`useMobileVersion`, `languageCode` and `countryCode` no longer exist. Instead, you need to use `headerGeneratorOptions` directly:

```ts
// Before:
await Apify.utils.requestAsBrowser({
    …,
    useMobileVersion: true,
    languageCode: 'en',
    countryCode: 'US',
});

// After:
await gotScraping({
    …,
    headerGeneratorOptions: {
        devices: ['mobile'], // or ['desktop']
        locales: ['en-US'],
    },
});
```

##### `timeoutSecs`

In order to set a timeout, use `timeout.request` (which is **milliseconds** now).

```ts
// Before:
await Apify.utils.requestAsBrowser({
    …,
    timeoutSecs: 30,
});

// After:
await gotScraping({
    …,
    timeout: {
        request: 30 * 1000,
    },
});
```

##### `throwOnHttpErrors`

`throwOnHttpErrors` → `throwHttpErrors`. This options throws on unsuccessful HTTP status codes, for example `404`. By default, it's set to `false`.

##### `decodeBody`

`decodeBody` → `decompress`. This options decompresses the body. Defaults to `true` - please do not change this or websites will break (unless you know what you're doing!).

##### `abortFunction`

This function used to make the promise throw on specific responses, if it returned `true`. However, it wasn't that useful.

You probably want to cancel the request instead, which you can do in the following way:

```ts
const promise = gotScraping(…);

promise.on('request', request => {
    // Please note this is not a Got Request instance, but a ClientRequest one.
    // https://nodejs.org/api/http.html#class-httpclientrequest

    if (request.protocol !== 'https:') {
        // Unsecure request, abort.
        promise.cancel();

        // If you set `isStream` to `true`, please use `stream.destroy()` instead.
    }
});

const response = await promise;
```

### Removal of browser pool plugin mixing

Previously, you were able to have a browser pool that would mix Puppeteer and Playwright plugins (or even your own custom plugins if you've built any). As of this version, that is no longer allowed, and creating such a browser pool will cause an error to be thrown (it's expected that all plugins that will be used are of the same type).

:::info Confused?

As an example, this change disallows a pool to mix Puppeteer with Playwright. You can still create pools that use multiple Playwright plugins, each with a different launcher if you want!

:::

### Handling requests outside of browser

One small feature worth mentioning is the ability to handle requests with browser crawlers outside the browser. To do that, we can use a combination of `Request.skipNavigation` and `context.sendRequest()`.

Take a look at how to achieve this by checking out the [Skipping navigation for certain requests](../examples/skip-navigation) example!

### Logging

Crawlee exports the default `log` instance directly as a named export. We also have a scoped `log` instance provided in the crawling context - this one will log messages prefixed with the crawler name and should be preferred for logging inside the request handler.

```ts
const crawler = new CheerioCrawler({
    async requestHandler({ log, request }) {
        log.info(`Opened ${request.loadedUrl}`);
    },
});
```

### Auto-saved crawler state

Every crawler instance now has `useState()` method that will return a state object we can use. It will be automatically saved when `persistState` event occurs. The value is cached, so we can freely call this method multiple times and get the exact same reference. No need to worry about saving the value either, as it will happen automatically.

```ts
const crawler = new CheerioCrawler({
    async requestHandler({ crawler }) {
        const state = await crawler.useState({ foo: [] as number[] });
        // just change the value, no need to care about saving it
        state.foo.push(123);
    },
});
```

### Apify SDK

The Apify platform helpers can be now found in the Apify SDK (`apify` NPM package). It exports the `Actor` class that offers following static helpers:

* `ApifyClient` shortcuts: `addWebhook()`, `call()`, `callTask()`, `metamorph()`
* helpers for running on Apify platform: `init()`, `exit()`, `fail()`, `main()`, `isAtHome()`, `createProxyConfiguration()`
* storage support: `getInput()`, `getValue()`, `openDataset()`, `openKeyValueStore()`, `openRequestQueue()`, `pushData()`, `setValue()`
* events support: `on()`, `off()`
* other utilities: `getEnv()`, `newClient()`, `reboot()`

`Actor.main` is now just a syntax sugar around calling `Actor.init()` at the beginning and `Actor.exit()` at the end (plus wrapping the user function in try/catch block). All those methods are async and should be awaited - with node 16 we can use the top level await for that. In other words, following is equivalent:

```ts
import { Actor } from 'apify';

await Actor.init();
// your code
await Actor.exit('Crawling finished!');
```

```ts
import { Actor } from 'apify';

await Actor.main(async () => {
    // your code
}, { statusMessage: 'Crawling finished!' });
```

`Actor.init()` will conditionally set the storage implementation of Crawlee to the `ApifyClient` when running on the Apify platform, or keep the default (memory storage) implementation otherwise. It will also subscribe to the websocket events (or mimic them locally). `Actor.exit()` will handle the tear down and calls `process.exit()` to ensure our process won't hang indefinitely for some reason.

#### Events

Apify SDK (v2) exports `Apify.events`, which is an `EventEmitter` instance. With Crawlee, the events are managed by <ApiLink to="core/class/EventManager">`EventManager`</ApiLink> class instead. We can either access it via `Actor.eventManager` getter, or use `Actor.on` and `Actor.off` shortcuts instead.

```diff
-Apify.events.on(...);
+Actor.on(...);
```

> We can also get the <ApiLink to="core/class/EventManager">`EventManager`</ApiLink> instance via `Configuration.getEventManager()`.

In addition to the existing events, we now have an `exit` event fired when calling `Actor.exit()` (which is called at the end of `Actor.main()`). This event allows you to gracefully shut down any resources when `Actor.exit` is called.

### Smaller/internal breaking changes

* `Apify.call()` is now just a shortcut for running `ApifyClient.actor(actorId).call(input, options)`, while also taking the token inside env vars into account
* `Apify.callTask()` is now just a shortcut for running `ApifyClient.task(taskId).call(input, options)`, while also taking the token inside env vars into account
* `Apify.metamorph()` is now just a shortcut for running `ApifyClient.task(taskId).metamorph(input, options)`, while also taking the ACTOR_RUN_ID inside env vars into account
* `Apify.waitForRunToFinish()` has been removed, use `ApifyClient.waitForFinish()` instead
* `Actor.main/init` purges the storage by default
* remove `purgeLocalStorage` helper, move purging to the storage class directly
    * `StorageClient` interface now has optional `purge` method
    * purging happens automatically via `Actor.init()` (you can opt out via `purge: false` in the options of `init/main` methods)
* `QueueOperationInfo.request` is no longer available
* `Request.handledAt` is now string date in ISO format
* `Request.inProgress` and `Request.reclaimed` are now `Set`s instead of POJOs
* `injectUnderscore` from puppeteer utils has been removed
* `APIFY_MEMORY_MBYTES` is no longer taken into account, use `CRAWLEE_AVAILABLE_MEMORY_RATIO` instead
* some `AutoscaledPool` options are no longer available:
    * `cpuSnapshotIntervalSecs` and `memorySnapshotIntervalSecs` has been replaced with top level `systemInfoIntervalMillis` configuration
    * `maxUsedCpuRatio` has been moved to the top level configuration
* `ProxyConfiguration.newUrlFunction` can be async. `.newUrl()` and `.newProxyInfo()` now return promises.
* `prepareRequestFunction` and `postResponseFunction` options are removed, use navigation hooks instead
* `gotoFunction` and `gotoTimeoutSecs` are removed
* removed compatibility fix for old/broken request queues with null `Request` props
* `fingerprintsOptions` renamed to `fingerprintOptions` (`fingerprints` -> `fingerprint`).
* `fingerprintOptions` now accept `useFingerprintCache` and `fingerprintCacheSize` (instead of `useFingerprintPerProxyCache` and `fingerprintPerProxyCacheSize`, which are now no longer available). This is because the cached fingerprints are no longer connected to proxy URLs but to sessions.


## [2.3.2](https://github.com/apify/crawlee/compare/v2.3.1...v2.3.2) (2022-05-05)

* fix: use default user agent for playwright with chrome instead of the default "headless UA"
* fix: always hide webdriver of chrome browsers

## [2.3.1](https://github.com/apify/crawlee/compare/v2.3.0...v2.3.1) (2022-05-03)

* fix: `utils.apifyClient` early instantiation (#1330)
* feat: `utils.playwright.injectJQuery()` (#1337)
* feat: add `keyValueStore` option to `Statistics` class (#1345)
* fix: ensure failed req count is correct when using `RequestList` (#1347)
* fix: random puppeteer crawler (running in headful mode) failure (#1348)
  > This should help with the `We either navigate top level or have old version of the navigated frame` bug in puppeteer.
* fix: allow returning falsy values in `RequestTransform`'s return type

## [2.3.0](https://github.com/apify/crawlee/compare/v2.2.2...v2.3.0) (2022-04-07)

* feat: accept more social media patterns (#1286)
* feat: add multiple click support to `enqueueLinksByClickingElements` (#1295)
* feat: instance-scoped "global" configuration (#1315)
* feat: requestList accepts proxyConfiguration for requestsFromUrls (#1317)
* feat: update `playwright` to v1.20.2
* feat: update `puppeteer` to v13.5.2
  > We noticed that with this version of puppeteer actor run could crash with
  > `We either navigate top level or have old version of the navigated frame` error
  > (puppeteer issue [here](https://github.com/puppeteer/puppeteer/issues/7050)).
  > It should not happen while running the browser in headless mode.
  > In case you need to run the browser in headful mode (`headless: false`),
  > we recommend pinning puppeteer version to `10.4.0` in actor `package.json` file.
* feat: stealth deprecation (#1314)
* feat: allow passing a stream to KeyValueStore.setRecord (#1325)
* fix: use correct apify-client instance for snapshotting (#1308)
* fix: automatically reset `RequestQueue` state after 5 minutes of inactivity, closes #997
* fix: improve guessing of chrome executable path on windows (#1294)
* fix: prune CPU snapshots locally (#1313)
* fix: improve browser launcher types (#1318)

### 0 concurrency mitigation

This release should resolve the 0 concurrency bug by automatically resetting the
internal `RequestQueue` state after 5 minutes of inactivity.

We now track last activity done on a `RequestQueue` instance:

* added new request
* started processing a request (added to `inProgress` cache)
* marked request as handled
* reclaimed request

If we don't detect one of those actions in last 5 minutes, and we have some
requests in the `inProgress` cache, we try to reset the state. We can override
this limit via `CRAWLEE_INTERNAL_TIMEOUT` env var.

This should finally resolve the 0 concurrency bug, as it was always about
stuck requests in the `inProgress` cache.

## [2.2.2](https://github.com/apify/crawlee/compare/v2.2.1...v2.2.2) (2022-02-14)

* fix: ensure `request.headers` is set
* fix: lower `RequestQueue` API timeout to 30 seconds
* improve logging for fetching next request and timeouts

## [2.2.1](https://github.com/apify/crawlee/compare/v2.2.0...v2.2.1) (2022-01-03)

* fix: ignore requests that are no longer in progress (#1258)
* fix: do not use `tryCancel()` from inside sync callback (#1265)
* fix: revert to puppeteer 10.x (#1276)
* fix: wait when `body` is not available in `infiniteScroll()` from Puppeteer utils (#1238)
* fix: expose logger classes on the `utils.log` instance (#1278)

## [2.2.0](https://github.com/apify/crawlee/compare/v2.1.0...v2.2.0) (2021-12-17)

### Proxy per page

Up until now, browser crawlers used the same session (and therefore the same proxy) for
all request from a single browser * now get a new proxy for each session. This means
that with incognito pages, each page will get a new proxy, aligning the behaviour with
`CheerioCrawler`.

This feature is not enabled by default. To use it, we need to enable `useIncognitoPages`
flag under `launchContext`:

```ts
new Apify.Playwright({
    launchContext: {
        useIncognitoPages: true,
    },
    // ...
})
```

> Note that currently there is a performance overhead for using `useIncognitoPages`.
> Use this flag at your own will.

We are planning to enable this feature by default in SDK v3.0.

### Abortable timeouts

Previously when a page function timed out, the task still kept running. This could lead to requests being processed multiple times. In v2.2 we now have abortable timeouts that will cancel the task as
early as possible.

### Mitigation of zero concurrency issue

Several new timeouts were added to the task function, which should help mitigate the zero concurrency bug. Namely fetching of next request information and reclaiming failed requests back to the queue
are now executed with a timeout with 3 additional retries before the task fails. The timeout is always at least 300s (5 minutes), or `requestHandlerTimeoutSecs` if that value is higher.

### Full list of changes

* fix `RequestError: URI malformed` in cheerio crawler (#1205)
* only provide Cookie header if cookies are present (#1218)
* handle extra cases for `diffCookie` (#1217)
* add timeout for task function (#1234)
* implement proxy per page in browser crawlers (#1228)
* add fingerprinting support (#1243)
* implement abortable timeouts (#1245)
* add timeouts with retries to `runTaskFunction()` (#1250)
* automatically convert google spreadsheet URLs to CSV exports (#1255)

## [2.1.0](https://github.com/apify/crawlee/compare/v2.0.7...v2.1.0) (2021-10-07)

* automatically convert google docs share urls to csv download ones in request list (#1174)
* use puppeteer emulating scrolls instead of `window.scrollBy` (#1170)
* warn if apify proxy is used in proxyUrls (#1173)
* fix `YOUTUBE_REGEX_STRING` being too greedy (#1171)
* add `purgeLocalStorage` utility method (#1187)
* catch errors inside request interceptors (#1188, #1190)
* add support for cgroups v2 (#1177)
* fix incorrect offset in `fixUrl` function (#1184)
* support channel and user links in YouTube regex (#1178)
* fix: allow passing `requestsFromUrl` to `RequestListOptions` in TS (#1191)
* allow passing `forceCloud` down to the KV store (#1186), closes #752
* merge cookies from session with user provided ones (#1201), closes #1197
* use `ApifyClient` v2 (full rewrite to TS)

## [2.0.7](https://github.com/apify/crawlee/compare/v2.0.6...v2.0.7) (2021-09-08)

* Fix casting of int/bool environment variables (e.g. `APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE`), closes #956
* Fix incognito pages and user data dir (#1145)
* Add `@ts-ignore` comments to imports of optional peer dependencies (#1152)
* Use config instance in `sdk.openSessionPool()` (#1154)
* Add a breaking callback to `infiniteScroll` (#1140)

## [2.0.6](https://github.com/apify/crawlee/compare/v2.0.5...v2.0.6) (2021-08-27)

* Fix deprecation messages logged from `ProxyConfiguration` and `CheerioCrawler`.
* Update `got-scraping` to receive multiple improvements.

## [2.0.5](https://github.com/apify/crawlee/compare/v2.0.4...v2.0.5) (2021-08-24)

* Fix error handling in puppeteer crawler

## [2.0.4](https://github.com/apify/crawlee/compare/v2.0.3...v2.0.4) (2021-08-23)

* Use `sessionToken` with `got-scraping`

## [2.0.3](https://github.com/apify/crawlee/compare/v2.0.2...v2.0.3) (2021-08-20)

* **BREAKING IN EDGE CASES** * We removed `forceUrlEncoding` in `requestAsBrowser` because we found out that recent versions of the underlying HTTP client `got` already encode URLs
  and `forceUrlEncoding` could lead to weird behavior. We think of this as fixing a bug, so we're not bumping the major version.
* Limit `handleRequestTimeoutMillis` to max valid value to prevent Node.js fallback to `1`.
* Use `got-scraping@^3.0.1`
* Disable SSL validation on MITM proxie
* Limit `handleRequestTimeoutMillis` to max valid value

## [2.0.2](https://github.com/apify/crawlee/compare/v2.0.1...v2.0.2) (2021-08-12)

* Fix serialization issues in `CheerioCrawler` caused by parser conflicts in recent versions of `cheerio`.

## [2.0.1](https://github.com/apify/crawlee/compare/v2.0.0...v2.0.1) (2021-08-06)

* Use `got-scraping` 2.0.1 until fully compatible.

## [2.0.0](https://github.com/apify/crawlee/compare/v1.3.4...v2.0.0) (2021-08-05)

* **BREAKING**: Require Node.js >=15.10.0 because HTTP2 support on lower Node.js versions is very buggy.
* **BREAKING**: Bump `cheerio` to `1.0.0-rc.10` from `rc.3`. There were breaking changes in `cheerio` between the versions so this bump might be breaking for you as well.
* Remove `LiveViewServer` which was deprecated before release of SDK v1.

0.20.2 / 2020-03-09
====================
- Fix an error where persistence of `SessionPool` would fail if a cookie included invalid
  `expires` value.
- Jumping a patch version because of an error in publishing via CI.

0.20.0 / 2020-03-03
====================
- **BREAKING:** `Apify.utils.requestAsBrowser()` no longer aborts request on status code 406
  or when other than `text/html` type is received. Use `options.abortFunction` if you want to
  retain this functionality.
- **BREAKING:** Added `useInsecureHttpParser` option to `Apify.utils.requestAsBrowser()` which
  is `true` by default and forces the function to use a HTTP parser that is less strict than
  default Node 12 parser, but also less secure. It is needed to be able to bypass certain
  anti-scraping walls and fetch websites that do not comply with HTTP spec.
- **BREAKING:** `RequestList` now removes all the elements from the `sources` array on
  initialization. If you need to use the sources somewhere else, make a copy. This change
  was added as one of several measures to improve memory management of `RequestList`
  in scenarios with very large amount of `Request` instances.
- **DEPRECATED:** `RequestListOptions.persistSourcesKey` is now deprecated. Please use
  `RequestListOptions.persistRequestsKey`.
- `RequestList.sources` can now be an array of `string` URLs as well.
- Added `sourcesFunction` to `RequestListOptions`. It enables dynamic fetching of sources
  and will only be called if persisted `Requests` were not retrieved from key-value store.
  Use it to reduce memory spikes and also to make sure that your sources are not re-created
  on actor restarts.
- Updated `stealth` hiding of `webdriver` to avoid recent detections.
- `Apify.utils.log` now points to an updated logger instance which prints colored logs (in TTY)
  and supports overriding with custom loggers.
- Improved `Apify.launchPuppeteer()` code to prevent triggering bugs in Puppeteer by passing
  more than required options to `puppeteer.launch()`.
- Documented `BasicCrawler.autoscaledPool` property, and added `CheerioCrawler.autoscaledPool`
  and `PuppeteerCrawler.autoscaledPool` properties.
- `SessionPool` now persists state on `teardown`. Before, it only persisted state every minute.
  This ensures that after a crawler finishes, the state is correctly persisted.
- Added TypeScript typings and typedef documentation for all entities used throughout SDK.
- Upgraded `proxy-chain` NPM package from 0.2.7 to 0.4.1 and many other dependencies
- Removed all usage of the now deprecated `request` package.

0.19.1 / 2020-01-30
====================
- **BREAKING (EXPERIMENTAL)**: `session.checkStatus() -> session.retireOnBlockedStatusCodes()`.
- `Session` API is no longer considered experimental.
- Updates documentation and introduces a few internal changes.

0.19.0 / 2020-01-20
====================
- **BREAKING**: `APIFY_LOCAL_EMULATION_DIR` env var is no longer supported (deprecated on 2018-09-11).
  Use `APIFY_LOCAL_STORAGE_DIR` instead.
- `SessionPool` API updates and fixes. The API is no longer considered experimental.
- Logging of system info moved from `require` time to `Apify.main()` invocation.
- Use native `RegExp` instead of `xregexp` for unicode property escapes.

0.18.1 / 2020-01-06
====================
- Fix `SessionPool` not automatically working in `CheerioCrawler`.
- Fix incorrect management of page count in `PuppeteerPool`.

0.18.0 / 2020-01-06
====================
- **BREAKING** `CheerioCrawler` ignores ssl errors by default - `options.ignoreSslErrors: true`.
- Add `SessionPool` implemenation to `CheerioCrawler`.
- Add `SessionPool` implementation to `PuppeteerPool` and `PupeteerCrawler`.
- Fix `Request` constructor not making a copy of objects such as `userData` and `headers`.
- Fix `desc` option not being applied in local `dataset.getData()`.

0.17.0 / 2019-11-25
====================
- **BREAKING**: Node 8 and 9 are no longer supported. Please use Node 10.17.0 or higher.
- **DEPRECATED**: `Apify.callTask()` `body` and `contentType` options are now deprecated.
  Use `input` instead. It must be of `content-type: application/json`.
- Add default `SessionPool` implementation to `BasicCrawler`.
- Add the ability to create ad-hoc webhooks via `Apify.call()` and `Apify.callTask()`.
- Add an example of form filling with `Puppeteer`.
- Add `country` option to `Apify.getApifyProxyUrl()`.
- Add `Apify.utils.puppeteer.saveSnapshot()` helper to quickly save HTML and screenshot of a page.
- Add the ability to pass `got` supported options to `requestOptions` in `CheerioCrawler`
  thus supporting things such as `cookieJar` again.
- Switch Puppeteer to web socket again due to suspected `pipe` errors.
- Fix an issue where some encodings were not correctly parsed in `CheerioCrawler`.
- Fix parsing bad Content-Type headers for `CheerioCrawler`.
- Fix custom headers not being correctly applied in `Apify.utils.requestAsBrowser()`.
- Fix dataset limits not being correctly applied.
- Fix a race condition in `RequestQueueLocal`.
- Fix `RequestList` persistence of downloaded sources in key-value store.
- Fix `Apify.utils.puppeteer.blockRequests()` always including default patterns.
- Fix inconsistent behavior of `Apify.utils.puppeteer.infiniteScroll()` on some websites.
- Fix retry histogram statistics sometimes showing invalid counts.
- Added regexps for Youtube videos (`YOUTUBE_REGEX`, `YOUTUBE_REGEX_GLOBAL`) to `utils.social`
- Added documentation for option `json` in handlePageFunction of `CheerioCrawler`

0.16.1 / 2019-10-31
====================
- Bump Puppeteer to 2.0.0 and use `{ pipe: true }` again because upstream bug has been fixed.
- Add `useIncognitoPages` option to `PuppeteerPool` to enable opening new pages in incognito
  browser contexts. This is useful to keep cookies and cache unique for each page.
- Added options to load every content type in CheerioCrawler.
There are new options `body` and `contentType` in `handlePageFunction` for this purposes.
- **DEPRECATED**: CheerioCrawler `html` option in `handlePageFunction` was replaced with `body` options.

0.16.0 / 2019-08-15
====================
- This release updates `@apify/http-request` to version 1.1.2.
- Update `CheerioCrawler` to use `requestAsBrowser()` to better disguise as a real browser.


0.15.5 / 2019-08-15
====================
- This release just updates some dependencies (not Puppeteer).

0.15.4 / 2019-08-02
====================
- **DEPRECATED**: `dataset.delete()`, `keyValueStore.delete()` and `requestQueue.delete()` methods have been
  deprecated in favor of `*.drop()` methods, because the `drop` name more clearly communicates the fact
  that those methods drop / delete the storage itself, not individual elements in the storage.
- Added `Apify.utils.requestAsBrowser()` helper function that enables you to make HTTP(S) requests disguising
  as a browser (Firefox). This may help in overcoming certain anti-scraping and anti-bot protections.
- Added `options.gotoTimeoutSecs` to `PuppeteerCrawler` to enable easier setting of navigation timeouts.
- `PuppeteerPool` options that were deprecated from the `PuppeteerCrawler` constructor were finally removed.
  Please use `maxOpenPagesPerInstance`, `retireInstanceAfterRequestCount`, `instanceKillerIntervalSecs`,
  `killInstanceAfterSecs` and `proxyUrls` via the `puppeteerPoolOptions` object.
- On the Apify Platform a warning will now be printed when using an outdated `apify` package version.
- `Apify.utils.puppeteer.enqueueLinksByClickingElements()` will now print a warning when the nodes it
  tries to click become modified (detached from DOM). This is useful to debug unexpected behavior.

0.15.3 / 2019-07-29
====================
- `Apify.launchPuppeteer()` now accepts `proxyUrl` with the `https`, `socks4`
  and `socks5` schemes, as long as it doesn't contain username or password.
  This is to fix [Issue #420](https://github.com/apifytech/apify-js/issues/420).
- Added `desiredConcurrency` option to `AutoscaledPool` constructor, removed
  unnecessary bound check from the setter property

0.15.2 / 2019-07-11
====================
- Fix error where Puppeteer would fail to launch when pipes are turned off.
- Switch back to default Web Socket transport for Puppeteer due to upstream issues.

0.15.1 / 2019-07-09
====================
- **BREAKING CHANGE** Removed support for Web Driver (Selenium) since no further updates are planned.
  If you wish to continue using Web Driver, please stay on Apify SDK version ^0.14.15
- **BREAKING CHANGE**: `Dataset.getData()` throws an error if user provides an unsupported option
  when using local disk storage.
- **DEPRECATED**: `options.userData` of `Apify.utils.enqueueLinks()` is deprecated.
  Use `options.transformRequestFunction` instead.
- Improve logging of memory overload errors.
- Improve error message in `Apify.call()`.
- Fix multiple log lines appearing when a crawler was about to finish.
- Add `Apify.utils.puppeteer.enqueueLinksByClickingElements()` function which enables you
  to add requests to the queue from pure JavaScript navigations, form submissions etc.
- Add `Apify.utils.puppeteer.infiniteScroll()` function which helps you with scrolling to the bottom
  of websites that auto-load new content.
- The `RequestQueue.handledCount()` function has been resurrected from deprecation,
  in order to have compatible interface with `RequestList`.
- Add `useExtendedUniqueKey` option to `Request` constructor to include `method` and `payload`
  in the `Request`'s computed `uniqueKey`.
- Updated Puppeteer to 1.18.1
- Updated `apify-client` to 0.5.22


0.14.15 / 2019-05-31
====================
- Fixes in `RequestQueue` to deal with inconsistencies in the underlying data storage
- **BREAKING CHANGE**: `RequestQueue.addRequest()` now sets the ID of the
  newly added request to the passed `Request` object
- The `RequestQueue.handledCount()` function has been deprecated,
  please use `RequestQueue.getInfo()` instead.

0.14.14 / 2019-05-30
====================
- Fix error where live view would crash when started with concurrency already higher than 1.

0.14.13 / 2019-05-30
====================
- Fix `POST` requests in Puppeteer.

0.14.12 / 2019-05-29
====================
- `Snapshotter` will now log critical memory overload warnings at most once per 10 seconds.
- Live view snapshots are now made right after navigation finishes, instead of right before page close.

0.14.11 / 2019-05-28
====================
- Add `Statistics` class to track crawler run statistics.
- Use pipes instead of web sockets in Puppeteer to improve performance and stability.
- Add warnings to all functions using Puppeteer's request interception to inform users about
  its performance impact caused by automatic cache disabling.
- **DEPRECATED**: `Apify.utils.puppeteer.blockResources()` because of negative impact on performance.
  Use `.blockRequests()` (see below).
- Add `Apify.utils.puppeteer.blockRequests()` to enable blocking URL patterns without request interception involved.
  This is a replacement for `.blockResources()` until performance issues with request interception resolve.


0.14.10 / 2019-05-24
====================
- Update `Puppeteer` to 1.17.0.
- Add `idempotencyKey` parameter to `Apify.addWebhook()`.

0.14.9 / 2019-05-22
===================
- Better logs from `AutoscaledPool` class
- Replace `cpuInfo` Apify event with new `systemInfo` event in `Snapshotter`.

0.14.8 / 2019-05-14
===================
- Bump `apify-client` to 0.5.17

0.14.7 / 2019-05-12
===================
- Bump `apify-client` to 0.5.16

0.14.6 / 2019-05-09
===================
- Stringification to JSON of actor input in `Apify.call()`, `Apify.callTask()` and `Apify.metamorph()`
  now also supports functions via `func.toString()`. The same holds for record body in `setValue()`
  method of key-value store.
- Request queue now monitors number of clients that accessed the queue which allows crawlers to finish
  without 10s waiting if run was not migrated during its lifetime.


0.14.5 / 2019-05-06
===================
- Update Puppeteer to 1.15.0.

0.14.4 / 2019-05-06
===================
- Added the `stealth` option `launchPuppeteerOptions` which decreases headless browser detection chance.
- **DEPRECATED**: `Apify.utils.puppeteer.hideWebDriver` use `launchPuppeteerOptions.stealth` instead.
- `CheerioCrawler` now parses HTML using streams. This improves performance and memory usage in most cases.

0.14.3 / 2019-05-06
===================
- Request queue now allows crawlers to finish quickly without waiting in a case that queue was used by a single client.
- Better logging of errors in `Apify.main()`

0.14.2 / 2019-04-25
===================
- Fix invalid type check in `puppeteerModule`.

0.14.1 / 2019-04-24
===================
- Made UI and UX improvements to `LiveViewServer` functionality.
- `launchPuppeteerOptions.puppeteerModule` now supports `Object` (pre-required modules).
- Removed `--enable-resource-load-scheduler=false` Chromium command line flag, it has no effect.
  See https://bugs.chromium.org/p/chromium/issues/detail?id=723233
- Fixed inconsistency in `prepareRequestFunction` of `CheerioCrawler`.
- Update Puppeteer to 1.14.0

0.14.0 / 2019-04-15
===================
- **BREAKING CHANGE:** Live View is no longer available by passing `liveView = true` to `launchPuppeteerOptions`.
- New version of Live View is available by passing the `useLiveView = true` option to `PuppeteerPool`.
   - Only shows snapshots of a single page from a single browser.
   - Only makes snapshots when a client is connected, having very low performance impact otherwise.
- Added `Apify.utils.puppeteer.addInterceptRequestHandler` and `removeInterceptRequestHandler` which
  can be used to add multiple request interception handlers to Puppeteer's pages.
- Added `puppeteerModule` to `LaunchPuppeteerOptions` which enables use of other Puppeteer modules,
  such as `puppeteer-extra` instead of plain `puppeteer`.

0.13.7 / 2019-04-04
===================
- Fix a bug where invalid response from `RequestQueue` would occasionally cause crawlers to crash.

0.13.5 / 2019-03-27
===================
- Fix `RequestQueue` throttling at high concurrency.

0.13.4 / 2019-03-26
===================
- Fix bug in `addWebhook` invocation.

0.13.3 / 2019-03-21
===================
- Fix `puppeteerPoolOptions` object not being used in `PuppeteerCrawler`.

0.13.2 / 2019-03-21
===================
- Fix `REQUEST_QUEUE_HEAD_MAX_LIMIT` is not defined error.

0.13.1 / 2019-03-21
===================
- `Snapshotter` now marks Apify Client overloaded on the basis of 2nd retry errors.
- Added `Apify.addWebhook()` to invoke a webhook when an actor run ends.
  Currently this only works on the Apify Platform and will print a warning when ran locally.

0.13.0 / 2019-03-14
===================
- **BREAKING CHANGE:** Added `puppeteerOperationTimeoutSecs` option to `PuppeteerPool`.
  It defaults to 15 seconds and all Puppeteer operations such as `browser.newPage()`
  or `puppeteer.launch()` will now time out. This is to prevent hanging requests.
- **BREAKING CHANGE:** Added `handleRequestTimeoutSecs` option to `BasicCrawler` with a 60 second default.
- **DEPRECATED:** `PuppeteerPool` options in the `PuppeteerCrawler` constructor are now deprecated.
  Please use the new `puppeteerPoolOptions` argument of type `Object` to pass them. `launchPuppeteerFunction`
  and `launchPuppeteerOptions` are still available as shortcuts for convenience.
- `CheerioCrawler` and `PuppeteerCrawler` now automatically set `handleRequestTimeoutSecs` to 10 times
  their `handlePageTimeoutSecs`. This is a precaution that should keep requests from hanging forever.
- Added `options.prepareRequestFunction()` to `CheerioCrawler` constructor to enable modification
  of `Request` before the HTTP request is made to the target URL.
- Added back the `recycleDiskCache` option to `PuppeteerPool` now that it is supported
  even in headless mode ([read more](https://bugs.chromium.org/p/chromium/issues/detail?id=882431))

0.12.4 / 2019-03-05
===================
- Parameters `input` and `options` added to `Apify.callTask()`.

0.12.2 / 2019-02-27
===================
- Added oldest active tab focusing to `PuppeteerPool` to combat resource throttling in Chromium.

0.12.1 / 2019-02-27
===================
- Added `Apify.metamorph()`, see documentation for more information.
- Added `Apify.getInput()`

0.12.0 / 2019-02-25
===================
- **BREAKING CHANGE:** Reduced default `handlePageTimeoutSecs` for both `CheerioCrawler` and `PuppeteerCrawler` from 300 to 60 seconds,
  in order to prevent stalling crawlers.
- **BREAKING CHANGE:** `PseudoUrl` now performs case-insensitive matching, even for the query string part of the URLs.
  If you need case sensitive matching, use an appropriate `RegExp` in place of a Pseudo URL string
- **Upgraded to puppeteer@1.12.2** and xregexp@4.2.4
- Added `loadedUrl` property to `Request` that contains the final URL of the loaded page after all redirects.
- Added memory overload warning log message.
- Added `keyValueStore.getPublicUrl` function.
- Added `minConcurrency`, `maxConcurrency`, `desiredConcurrency`
  and `currentConcurrency` properties to `AutoscaledPool`, improved docs
- Deprecated `AutoscaledPool.setMinConcurrency` and `AutoscaledPool.setMaxConcurrency` functions
- Updated `DEFAULT_USER_AGENT` and `USER_AGENT_LIST` with new User Agents
- Bugfix: `LocalRequestQueue.getRequest()` threw an exception if request was not found
- Added `RequestQueue.getInfo()` function
- Improved `Apify.main()` to provide nicer stack traces on errors
- `Apify.utils.puppeteer.injectFile()` now supports injection that survives page navigations and caches file contents.

0.11.8 / 2019-02-05
===================
- Fix the `keyValueStore.forEachKey()` method.
- Fix version of `puppeteer` to prevent errors with automatic updates.

0.11.7 / 2019-01-30
===================
- Apify SDK now logs basic system info when `required`.
- Added `utils.createRequestDebugInfo()` function to create a standardized debug info from request and response.
- `PseudoUrl` can now be constructed with a `RegExp`.
- `Apify.utils.enqueueLinks()` now accepts `RegExp` instances in its `pseudoUrls` parameter.
- `Apify.utils.enqueueLinks()` now accepts a `baseUrl` option that enables resolution of relative URLs
   when parsing a Cheerio object. (It's done automatically in browser when using Puppeteer).
- Better error message for an invalid `launchPuppeteerFunction` passed to `PuppeteerPool`.

0.11.6 / 2019-01-24
===================
- **DEPRECATION WARNING** `Apify.utils.puppeteer.enqueueLinks()` was moved to `Apify.utils.enqueueLinks()`.
- `Apify.utils.enqueueLinks()` now supports `options.$` property to enqueue links from a Cheerio object.

0.11.5 / 2019-01-18
===================
- Disabled the `PuppeteerPool` `reusePages` option for now, due to a memory leak.
- Added a `keyValueStore.forEachKey()` method to iterate all keys in the store.

0.11.4 / 2019-01-15
===================
- Improvements in `Apify.utils.social.parseHandlesFromHtml` and `Apify.utils.htmlToText`
- Updated docs

0.11.3 / 2019-01-10
===================
- Fix `reusePages` causing Puppeteer to fail when used together with request interception.

0.11.2 / 2019-01-10
===================
- Fix missing `reusePages` configuration parameter in `PuppeteerCrawler`.
- Fix a memory leak where `reusePages` would prevent browsers from closing.

0.11.1 / 2019-01-07
===================
- Fix missing `autoscaledPool` parameter in `handlePageFunction` of `PuppeteerCrawler`.

0.11.0 / 2019-01-07
===================
- **BREAKING CHANGE:** `basicCrawler.abort()`, `cheerioCrawler.abort()` and `puppeteerCrawler.abort()` functions
  were removed in favor of a single `autoscaledPool.abort()` function.

- Added a reference to the running `AutoscaledPool` instance to the options object of `BasicCrawler`'s
  `handleRequestFunction` and to the `handlePageFunction` of `CheerioCrawler` and `PuppeteerCrawler`.
- Added sources persistence option to `RequestList` that works best in conjunction with the state persistence,
  but can be toggled separately too.
- Added `Apify.openRequestList()` function to place it in line with `RequestQueue`, `KeyValueStore` and `Dataset`.
  `RequestList` created using this function will automatically persist state and sources.
- Added `pool.pause()` and `pool.resume()` functions to `AutoscaledPool`. You can now pause the pool,
  which will prevent additional tasks from being run and wait for the running ones to finish.
- Fixed a memory leak in `CheerioCrawler` and potentially other crawlers.

0.10.2 / 2018-12-30
===================
- Added `Apify.utils.htmlToText()` function to convert HTML to text and removed unncessary `html-to-text` dependency.
  The new function is now used in `Apify.utils.social.parseHandlesFromHtml()`.
- Updated `DEFAULT_USER_AGENT`

0.10.0 / 2018-12-19
===================
- `autoscaledPool.isFinishedFunction()` and `autoscaledPool.isTaskReadyFunction()` exceptions
  will now cause the `Promise` returned by `autoscaledPool.run()` to reject instead of just
  logging a message. This is in line with the `autoscaledPool.runTaskFunction()` behavior.
- Bugfix: PuppeteerPool was incorrectly overriding `proxyUrls` even if they were not defined.
- Fixed an issue where an error would be thrown when `datasetLocal.getData()` was invoked
  with an overflowing offset. It now correctly returns an empty `Array`.
- Added the `reusePages` option to `PuppeteerPool`. It will now reuse existing tabs
  instead of opening new ones for each page when enabled.
- `BasicCrawler` (and therefore all Crawlers) now logs a message explaining why it finished.
- Fixed an issue where `maxRequestsPerCrawl` option would not be honored after restart or migration.
- Fixed an issue with timeout promises that would sometimes keep the process hanging.
- `CheerioCrawler` now accepts `gzip` and `deflate` compressed responses.

0.9.15 / 2018-11-30
===================
- Upgraded Puppeteer to 1.11.0
- **DEPRECATION WARNING:** `Apify.utils.puppeteer.enqueueLinks()` now uses an options object instead of individual parameters
  and supports passing of `userData` to the enqueued `request`. Previously: `enqueueLinks(page, selector, requestQueue, pseudoUrls)`
  Now: `enqueueLinks({ page, selector, requestQueue, pseudoUrls, userData })`. Using individual parameters is **DEPRECATED**.

0.9.14 / 2018-11-27
===================
- Added API response tracking to AutoscaledPool, leveraging `Apify.client.stats` object. It now overloads the system
  when a large amount of  429 - Too Many Requests is received.

0.9.13 / 2018-11-26
===================
- Updated NPM packages to fix a vulnerability reported at https://github.com/dominictarr/event-stream/issues/116

0.9.12 / 2018-11-26
===================
- Added warning if the Node.js is an older version that doesn't support regular expression syntax used by the tools in
  the `Apify.utils.social` namespace, instead of failing to start.

0.9.11 / 2018-11-26
===================
- Added back support for `memory` option in `Apify.call()`, write deprecation warning instead of silently failing

0.9.10 / 2018-11-24
===================
- Improvements in `Apify.utils.social` functions and tests

0.9.8 / 2018-11-24
==================
- Added new `Apify.utils.social` namespace with function to extract emails, phone and social profile URLs
  from HTML and text documents. Specifically, it supports Twitter, LinkedIn, Instagram and Facebook profiles.
- Updated NPM dependencies

0.9.7 / 2018-11-20
==================
- `Apify.launchPuppeteer()` now sets the `defaultViewport` option if not provided by user,
  to improve screenshots and debugging experience.
- Bugfix: `Dataset.getInfo()` sometimes returned an object with `itemsCount` field instead of `itemCount`

0.9.6 / 2018-11-20
==================
- Improvements in deployment script.

0.9.5 / 2018-11-19
==================
- Bugfix: `Apify.call()` was causing permissions error.

0.9.4 / 2018-11-19
==================
- Automatically adding `--enable-resource-load-scheduler=false`
  Chrome flag in `Apify.launchPuppeteer()`
  to make crawling of pages in all tabs run equally fast.

0.9.3 / 2018-11-12
==================
- Bug fixes and improvements of internals.
- Package updates.

0.9.0 / 2018-11-07
===================
- Added the ability of `CheerioCrawler` to request and download only `text/html` responses.
- Added a workaround for a long standing `tunnel-agent` package error to `CheerioCrawler`.
- Added `request.doNotRetry()` function to prevent further retries of a `request`.
- Deprecated `request.ignoreErrors` option. Use `request.doNotRetry`.
- Fixed `Apify.utils.puppeteer.enqueueLinks` to allow `null` value for `pseudoUrls` param
- Fixed `RequestQueue.addRequest()` to gracefully handle invalid URLs
- Renamed `RequestOperationInfo` to `QueueOperationInfo`
- Added `request` field to `QueueOperationInfo`
- **DEPRECATION WARNING**: Parameter `timeoutSecs` of `Apify.call()` is used for actor run timeout.
    For time of waiting for run to finish use `waitSecs` parameter.
- **DEPRECATION WARNING**: Parameter `memory` of `Apify.call()` was renamed to `memoryMbytes`.
- Added `Apify.callTask()` that enables to start actor task and fetch its output.
- Added option enforcing cloud storage to be used in `openKeyValueStore()`, `openDataset()` and `openRequestQueue()`
- Added `autoscaledPool.setMinConcurrency()` and `autoscaledPool.setMinConcurrency()`

0.8.18 / 2018-10-30
===================
- Fix a bug in `CheerioCrawler` where `useApifyProxy` would only work with `apifyProxyGroups`.

0.8.17 / 2018-10-30
===================
- Reworked `request.pushErrorMessage()` to support any message and not throw.
- Added Apify Proxy (`useApifyProxy`) support to `CheerioCrawler`.
- Added custom `proxyUrls` support to `PuppeteerPool` and `CheerioCrawler`.
- Added Actor UI `pseudoUrls` output support to `Apify.utils.puppeteer.enqueueLinks()`.

0.8.16 / 2018-10-23
===================
- Created dedicated project page at https://sdk.apify.com
- Improved docs, texts, guides and other texts, pointed links to new page

0.8.15 / 2018-10-17
===================
- Bugfix in `PuppeteerPool`: Pages were sometimes considered closed even though they weren't
- Improvements in documentation
- Upgraded Puppeteer to 1.9.0

0.8.14 / 2018-10-11
===================
- Added `Apify.utils.puppeteer.cacheResponses` to enable response caching in headless Chromium.

0.8.13 / 2018-10-09
===================
- Fixed `AutoscaledPool` terminating before all tasks are finished.
- Migrated to v 0.1.0 of `apify-shared`.

0.8.12 / 2018-10-02
==================
- Allow AutoscaledPool to run tasks up to minConcurrency even when the system is overloaded.

0.8.11 / 2018-09-27
==================
- Upgraded @apify/ps-tree depedency (fixes "Error: spawn ps ENFILE"), upgraded other NPM packages

0.8.10 / 2018-09-27
==================
- Updated documentation and README, consolidated images.
- Added CONTRIBUTING.md

0.8.8 / 2018-09-25
==================
- Updated documentation and README.
- Bugfixes in `RequestQueueLocal`

0.8.3 / 2018-09-22
==================
- Updated documentation and README.
- Optimized autoscaled pool default configuration.

0.8.0 / 2018-09-19
==================
- **BREAKING CHANGES IN AUTOSCALED POOL**
   - It has been completely rebuilt for better performance.
   - It also now works locally.
   - see [Migration Guide](MIGRATIONS.md) for more information.
- Updated to apify-shared@0.0.58

0.7.4 / 2018-09-18
==================
- Bug fixes and documentation improvements.

0.7.1 / 2018-09-14
==================
- Upgraded Puppeteer to 1.8.0
- Upgraded NPM dependencies, fixed lint errors
- `Apify.main()` now sets the `APIFY_LOCAL_STORAGE_DIR` env var to a default value
  if neither `APIFY_LOCAL_STORAGE_DIR` nor `APIFY_TOKEN` is defined

0.7.0 / 2018-09-11
==================
- Updated `DEFAULT_USER_AGENT` and `USER_AGENT_LIST`
- Added `recycleDiskCache` option to `PuppeteerPool` to enable reuse of disk cache and thus speed up browsing
- **WARNING**: `APIFY_LOCAL_EMULATION_DIR` environment variable was renamed to `APIFY_LOCAL_STORAGE_DIR`.
- Environment variables `APIFY_DEFAULT_KEY_VALUE_STORE_ID`, `APIFY_DEFAULT_REQUEST_QUEUE_ID` and `APIFY_DEFAULT_DATASET_ID`
  have now default value `default` so there is no need to define them when developing locally.

0.6.4 / 2018-09-05
==================
- Added `compileScript()` function to `utils.puppeteer` to enable use of external scripts at runtime.

0.6.3 / 2018-08-24
==================
- Fixed persistent deprecation warning of `pageOpsTimeoutMillis`.
- Moved `cheerio` to dependencies.
- Fixed `keepDuplicateUrls` errors with persistent RequestList.

0.6.2 / 2018-08-23
===================
- Added `getInfo()` method to Dataset to get meta-information about a dataset.
- Added CheerioCrawler, a specialized class for crawling the web using `cheerio`.
- Added `keepDuplicateUrls` option to RequestList to allow duplicate URLs.
- Added `.abort()` method to all Crawler classes to enable stopping the crawl programmatically.
- Deprecated `pageOpsTimeoutMillis` option. Use `handlePageTimeoutSecs`.
- Bluebird promises are being phased out of `apify` in favor of `async-await`.
- Added `log` to `Apify.utils` to improve logging experience.

0.6.1 / 2018-08-17
===================
- Replaced git-hosted version of our fork of ps-tree with @apify/ps-tree package
- Removed old unused Apify.readyFreddy() function

0.6.0 / 2018-08-17
===================
- Improved logging of URL and port in `PuppeteerLiveViewBrowser`.
- PuppeteerCrawler's default page load timeout changed from 30 to 60 seconds.
- Added `Apify.utils.puppeteer.blockResources()` function
- More efficient implementation of `getMemoryInfo` function
- Puppeteer upgraded to 1.7.0
- Upgraded NPM dependencies
- Dropped support for Node 7

0.5.51 / 2018-08-09
===================
- Fixed unresponsive magnifying glass and improved status tracking in LiveView frontend

0.5.50 / 2018-08-06
===================
- Fixed invalid URL parsing in RequestList.
- Added support for non-Latin language characters (unicode) in URLs.
- Added validation of payload size and automatic chunking to `dataset.pushData()`.
- Added support for all content types and their known extensions to `KeyValueStoreLocal`.

0.5.47 / 2018-07-20
===================
- Puppeteer upgraded to 1.6.0.
- Removed `pageCloseTimeoutMillis` option from `PuppeteerCrawler` since it only affects debug logging.

0.5.43 / 2018-07-18
===================
- Bug where failed `page.close()` in `PuppeteerPool` was causing request to be retried is fixed.
- Added `memory` parameter to `Apify.call()`.
- Added `PuppeteerPool.retire(browser)` method allowing retire a browser before it reaches his limits. This is
  useful when its IP address got blocked by anti-scraping protection.
- Added option `liveView: true` to `Apify.launchPuppeteer()` that will start a live view server proving web page
  with overview of all running Puppeteer instances and their screenshots.
- `PuppeteerPool` now kills opened Chrome instances in `SIGINT` signal.

0.5.42 / 2018-07-04
===================
- Bugfix in BasicCrawler: native Promise doesn't have finally() function

0.5.39 / 2018-06-25
===================
- Parameter `maxRequestsPerCrawl` added to `BasicCrawler` and `PuppeteerCrawler` classes.

0.5.38 / 2018-06-22
===================
- Revereted back - `Apify.getApifyProxyUrl()` accepts again `session` and `groups` options instead of
  `apifyProxySession` and `apifyProxyGroups`
- Parameter `memory` added to `Apify.call()`.

0.5.37 / 2018-06-07
===================
- `PseudoUrl` class can now contain a template for `Request` object creation and `PseudoUrl.createRequest()` method.
- Added `Apify.utils.puppeteer.enqueueLinks()` function which enqueues requests created from links mathing given pseudo-URLs.

0.5.36 / 2018-05-31
===================
- Added 30s timeout to `page.close()` operation in `PuppeteerCrawler`.

0.5.35 / 2018-05-29
===================
- Added `dataset.detData()`, `dataset.map()`, `dataset.forEach()` and `dataset.reduce()` functions.
- Added `delete()` method to `RequestQueue`, `Dataset` and `KeyValueStore` classes.

0.5.34 / 2018-05-18
===================
- Added `loggingIntervalMillis` options to `AutoscaledPool`
- Bugfix: `utils.isProduction` function was incorrect
- Added `RequestList.length()` function

0.5.32 / 2018-05-14
===================
- Bugfix in `RequestList` - skip invalid in-progress entries when restoring state
- Added `request.ignoreErrors` options. See documentation for more info.

0.5.31 / 2018-05-11
===================
- Bugfix in `Apify.utils.puppeteer.injectXxx` functions

0.5.30 / 2018-05-11
===================
- Puppeteer updated to v1.4.0

0.5.29 / 2018-05-11
===================
- Added `Apify.utils` and `Apify.utils.puppeteer` namespaces for various helper functions.
- Autoscaling feature of `AutoscaledPool`, `BasicCrawler` and `PuppeteerCrawler` is disabled on Apify platform until all issues are resolved.

0.5.27 / 2018-04-30
===================
- Added `Apify.isAtHome()` function that returns `true` when code is running on Apify platform and `false` otherwise
  (for example locally).
- Added `ignoreMainProcess` parameter to `AutoscaledPool`. Check documentation for more info.
- `pageOpsTimeoutMillis` of `PuppeteerCrawler` increased to 300 seconds.

0.5.26 / 2018-04-27
===================
- Parameters `session` and `groups` of `getApifyProxyUrl()` renamed to `apifyProxySession` and `apifyProxyGroups` to match
  naming of the same parameters in other classes.

0.5.25 / 2018-04-24
===================
- `RequestQueue` now caches known requests and their state to beware of unneeded API calls.

0.5.23 / 2018-04-18
===================
- **WARNING**: `disableProxy` configuration of `PuppeteerCrawler` and `PuppeteerPool` removed. By default no proxy is used.
  You must either use new configuration `launchPuppeteerOptions.useApifyProxy = true` to use Apify Proxy or provide own proxy via
  `launchPuppeteerOptions.proxyUrl`.
- **WARNING**: `groups` parameter of `PuppeteerCrawler` and `PuppeteerPool` removed. Use `launchPuppeteerOptions.apifyProxyGroups` instead.
- **WARNING**: `session` and `groups` parameters of `Apify.getApifyProxyUrl()` are now validated to contain only alphanumberic
  characters and underscores.
- `Apify.call()` now throws an `ApifyCallError` error if run doesn't succeed
- Renamed options `abortInstanceAfterRequestCount` of `PuppeteerPool` and `PuppeteerCrawler` to retireInstanceAfterRequestCcount
- Logs are now in plain text instead of JSON for better readability.

0.5.22 / 2018-04-12
===================
- **WARNING**: `AutoscaledPool` was completely redesigned. Check documentation for reference. It still supports previous
  configuration parameters for backwards compatibility but in the future compatibility will break.
- `handleFailedRequestFunction` in both `BasicCrawler` and `PuppeteerCrawler` has now also error object
  available in `ops.error`.
- Request Queue storage type implemented. See documentation for more information.
- `BasicCrawler` and `PuppeteerCrawler` now supports both `RequestList` and `RequestQueue`.
- `launchPuppeteer()` changes `User-Agent` only when in headless mode or if not using full Google Chrome,
  to reduce chance of detection of the crawler.
- Apify package now supports Node 7 and newer.
- `AutoscaledPool` now scales down less aggresively.
- `PuppeteerCrawler` and `BasicCrawler` now allow its underlying `AutoscaledPool` function `isFunction` to be overriden.
- New events `persistState` and `migrating` added. Check documentation of `Apify.events` for more information.
- `RequestList` has a new parameter `persistStateKey`. If this is used then `RequestList` persists its state in the default
  key-value store at regular intervals.
- Improved `README.md` and `/examples` directory.

0.5.17 / 2018-03-27
===================
- Added `useChrome` flag to `launchPuppeteer()` function
- Bugfixes in `RequestList`

0.5.14 / 2018-03-20
===================
- Removed again the --disable-dev-shm-usage flag when launching headless Chrome,
  it might be causing issues with high IO overheads
- Upgraded Puppeteer to version 1.2.0
- Added `finishWhenEmpty` and `maybeRunPromiseIntervalMillis` options to `AutoscaledPool` class.
- Fixed false positive errors logged by `PuppeteerPool` class.

0.5.11 / 2018-03-09
===================
- Added back `--no-sandbox` to launch of Puppeteer to avoid issues on older kernels

0.5.10 / 2018-03-09
===================
- If the `APIFY_XVFB` env var is set to `1`, then avoid headless mode and use Xvfb instead
- Updated DEFAULT_USER_AGENT to Linux Chrome
- Consolidated startup options for Chrome - use `--disable-dev-shm-usage`, skip `--no-sandbox`,
  use `--disable-gpu` only on Windows
- Updated docs and package description

0.5.8 / 2018-03-06
==================
- Puppeteer updated to `1.1.1`

0.5.7 / 2018-03-06
==================
- A lot of new stuff. Everything is backwards compatible. Check https://sdk.apify.com/ for reference

0.5.0 / 2018-02-08
===================
- `Apify.setPromiseDependency()` / `Apify.getPromiseDependency()` / `Apify.getPromisePrototype()` removed
- Bunch of classes as `AutoscaledPool` or `PuppeteerCrawler` added, check documentation

0.4.48 / 2018-02-05
===================
- Renamed GitHub repo

0.4.47 / 2018-02-05
===================
- Changed links to Travis CI

0.4.46 / 2018-02-05
===================
- Changed links to Apify GitHub repo

0.4.45 / 2018-01-31
===================
- `Apify.pushData()` added

0.4.43 / 2018-01-29
===================
- Upgraded puppeteer optional dependency to version `^1.0.0`

0.0.x / 2017-01-01
==================
- Initial development, lot of new stuff

xxx
===================
- Fixed `Apify.utils.puppeteer.enqueueLinks` to allow `null` value for `pseudoUrls` param

0.8.19 / 2018-11-05
===================
- Fixed `RequestQueue.addRequest()` to gracefully handle invalid URLs
- Renamed `RequestOperationInfo` to `QueueOperationInfo`
- Added `request` field to `QueueOperationInfo`
- Added option enforcing cloud storage to be used in `openKeyValueStore()`, `openDataset()` and `openRequestQueue()`

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
- A lot of new stuff. Everything is backwards compatible. Check https://www.apify.com/docs/sdk/apify-runtime-js/latest for reference

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

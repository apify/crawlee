0.5.43 / 2018-07-18
===================
- Bug where failed `page.close()` in `PuppeteerPool` was causing request to be retried is fixed.
- Added `memory` parameter to `Apify.call()`.
- Added `PuppeteerPool.retire(browser)` method allowing retire a browser before it reaches his limits. This is
  usefull when its IP address got blocked by anti-scraping protection.
- Added option `liveView: true` to `Apify.launchPuppeteer()` that will start a live view server proving web page
  with overview of all running Puppeteer instances and their screenshots.

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
- Autoscaling feature of `AutoscaledPool`, `BasicCrawler` and `PuppeteerCrawler` is disabled out of Apify platform until all the issues will be solved.

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

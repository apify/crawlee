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

0.5.14 / 2018-03-09
===================
- Added back `--no-sandbox` to launch of Puppeteer to avoid issues on older kernels
- Added `finishWhenEmpty` and `maybeRunPromiseIntervalMillis` options to `AutoscaledPool` class.
- Fixed false positive errors logged by `PuppeteerPool` class.

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

# `@crawlee/core`

Core set of classes required for Crawlee.

The [`crawlee`](https://www.npmjs.com/package/crawlee) package consists of several smaller packages, released separately under `@crawlee` namespace:

- `@crawlee/core`: the base for all the crawler implementations, also contains things like `Request`, `RequestQueue`, `RequestList` or `Dataset` classes
- `@crawlee/basic`: exports `BasicCrawler`
- `@crawlee/http`: exports `HttpCrawler` (which is used for creating `@crawlee/dom` and `@crawlee/cheerio`)
- `@crawlee/dom`: exports `DOMCrawler`
- `@crawlee/cheerio`: exports `CheerioCrawler`
- `@crawlee/browser`: exports `BrowserCrawler` (which is used for creating `@crawlee/playwright` and `@crawlee/puppeteer`)
- `@crawlee/playwright`: exports `PlaywrightCrawler`
- `@crawlee/puppeteer`: exports `PuppeteerCrawler`
- `@crawlee/memory-storage`: `@apify/storage-local` alternative
- `@crawlee/browser-pool`: previously `browser-pool` package
- `@crawlee/utils`: utility methods
- `@crawlee/types`: holds TS interfaces mainly about the `StorageClient`

## Installing Crawlee

Most of the Crawlee packages are extending and reexporting each other, so it's enough to install just the one you plan on using, e.g. `@crawlee/playwright` if you plan on using `playwright` - it already contains everything from the `@crawlee/browser` package, which includes everything from `@crawlee/basic`, which includes everything from `@crawlee/core`.

If we don't care much about additional code being pulled in, we can just use the `crawlee` meta-package, which contains (re-exports) most of the `@crawlee/*` packages, and therefore contains all the crawler classes.

```bash
npm install crawlee
```

Or if all we need is cheerio support, we can install only `@crawlee/cheerio`.

```bash
npm install @crawlee/cheerio
```

When using `playwright` or `puppeteer`, we still need to install those dependencies explicitly - this allows the users to be in control of which version will be used.

```bash
npm install crawlee playwright
# or npm install @crawlee/playwright playwright
```

Alternatively we can also use the `crawlee` meta-package which contains (re-exports) most of the `@crawlee/*` packages, and therefore contains all the crawler classes.

> Sometimes you might want to use some utility methods from `@crawlee/utils`, so you might want to install that as well. This package contains some utilities that were previously available under `Apify.utils`. Browser related utilities can be also found in the crawler packages (e.g. `@crawlee/playwright`).

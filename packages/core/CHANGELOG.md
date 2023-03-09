# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)


### Bug Fixes

* ignore invalid URLs in `enqueueLinks` in browser crawlers ([#1803](https://github.com/apify/crawlee/issues/1803)) ([5ac336c](https://github.com/apify/crawlee/commit/5ac336c5b83b212fd6281659b8ceee091e259ff1))


### Features

* **core:** add `exclude` option to `enqueueLinks` ([#1786](https://github.com/apify/crawlee/issues/1786)) ([2e833dc](https://github.com/apify/crawlee/commit/2e833dc4b0b82bb6741aa683f3fcba05244427df)), closes [#1785](https://github.com/apify/crawlee/issues/1785)





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)

**Note:** Version bump only for package @crawlee/core





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)


### Bug Fixes

* add `QueueOperationInfo` export to the core package ([5ec6c24](https://github.com/apify/crawlee/commit/5ec6c24ba31c11c0ff4db49a6461f112a70071b3))





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* clone `request.userData` when creating new request object ([#1728](https://github.com/apify/crawlee/issues/1728)) ([222ef59](https://github.com/apify/crawlee/commit/222ef59b646740ae46be011ea0bc3d11c51a553e)), closes [#1725](https://github.com/apify/crawlee/issues/1725)
* declare missing dependency on `tslib` ([27e96c8](https://github.com/apify/crawlee/commit/27e96c80c26e7fc31809a4b518d699573cb8c662)), closes [#1747](https://github.com/apify/crawlee/issues/1747)
* ensure CrawlingContext interface is inferred correctly in route handlers ([aa84633](https://github.com/apify/crawlee/commit/aa84633b1a2007c2e91bf012e944433b21243f2e))
* **utils:** add missing dependency on `ow` ([bf0e03c](https://github.com/apify/crawlee/commit/bf0e03cc6ddc103c9337de5cd8dce9bc86c369a3)), closes [#1716](https://github.com/apify/crawlee/issues/1716)


### Features

* **enqueueLinks:** add SameOrigin strategy and relax protocol matching for the other strategies ([#1748](https://github.com/apify/crawlee/issues/1748)) ([4ba982a](https://github.com/apify/crawlee/commit/4ba982a909a3c16004b24ef90c3da3ee4e075be0))





## [3.1.3](https://github.com/apify/crawlee/compare/v3.1.2...v3.1.3) (2022-12-07)

**Note:** Version bump only for package @crawlee/core





## [3.1.2](https://github.com/apify/crawlee/compare/v3.1.1...v3.1.2) (2022-11-15)

### Bug Fixes

* injectJQuery in context does not survive navs ([#1661](https://github.com/apify/crawlee/issues/1661)) ([493a7cf](https://github.com/apify/crawlee/commit/493a7cff569cb12cfd9aa5e0f4fcb9de686eb41f))
* make router error message more helpful for undefined routes ([#1678](https://github.com/apify/crawlee/issues/1678)) ([ab359d8](https://github.com/apify/crawlee/commit/ab359d84f2ebdac69441ae84dcade1bca7714390))
* **MemoryStorage:** correctly respect the desc option ([#1666](https://github.com/apify/crawlee/issues/1666)) ([b5f37f6](https://github.com/apify/crawlee/commit/b5f37f66a50b2d546eca24a699cf92cb683b7026))
* requestHandlerTimeout timing ([#1660](https://github.com/apify/crawlee/issues/1660)) ([493ea0c](https://github.com/apify/crawlee/commit/493ea0ce80e55ece5a8881a6aea6674918873b35))
* shallow clone browserPoolOptions before normalization ([#1665](https://github.com/apify/crawlee/issues/1665)) ([22467ca](https://github.com/apify/crawlee/commit/22467ca81ad9464d528495333f62a60f2ea0487c))
* support headfull mode in playwright js project template ([ea2e61b](https://github.com/apify/crawlee/commit/ea2e61bc3bfcc9a895a89ad6db415a398bd3b7db))
* support headfull mode in puppeteer js project template ([e6aceb8](https://github.com/apify/crawlee/commit/e6aceb81ed0762f25dde66ff94ccdf8c1a619f7d))

### Features

* **jsdom-crawler:** add runScripts option ([#1668](https://github.com/apify/crawlee/issues/1668)) ([8ef90bc](https://github.com/apify/crawlee/commit/8ef90bc1c020ddee334dd9a9267f6b6298a27024))


## [3.1.1](https://github.com/apify/crawlee/compare/v3.1.0...v3.1.1) (2022-11-07)

### Bug Fixes

* `utils.playwright.blockRequests` warning message ([#1632](https://github.com/apify/crawlee/issues/1632)) ([76549eb](https://github.com/apify/crawlee/commit/76549eb250a39e961b7f567ad0610af136d1c79f))
* concurrency option override order ([#1649](https://github.com/apify/crawlee/issues/1649)) ([7bbad03](https://github.com/apify/crawlee/commit/7bbad0380cd6de3fdca79ba57e1fef1d22bd56f8))
* handle non-error objects thrown gracefully ([#1652](https://github.com/apify/crawlee/issues/1652)) ([c3a4e1a](https://github.com/apify/crawlee/commit/c3a4e1a9b7d0b80a8e889bdcb394fc0be3905c6f))
* mark session as bad on failed requests ([#1647](https://github.com/apify/crawlee/issues/1647)) ([445ae43](https://github.com/apify/crawlee/commit/445ae4321816bc418a83c02fb52e64df96bfb0a9))
* support reloading of sessions with lots of retries ([ebc89d2](https://github.com/apify/crawlee/commit/ebc89d2d69d5a2da6eb4e37de59ea39daf81f8f8))
* fix type errors when `playwright` is not installed ([#1637](https://github.com/apify/crawlee/issues/1637)) ([de9db0c](https://github.com/apify/crawlee/commit/de9db0c2b24019d2e1dd43206dd7f149ecdc679a))
* upgrade to puppeteer@19.x ([#1623](https://github.com/apify/crawlee/issues/1623)) ([ce36d6b](https://github.com/apify/crawlee/commit/ce36d6bd60c7adb113759126b3cb15ca222e94d0))

### Features

* add static `set` and `useStorageClient` shortcuts to `Configuration` ([2e66fa2](https://github.com/apify/crawlee/commit/2e66fa2fad84aee2dca08b386916b465a0c012a3))
* enable migration testing ([#1583](https://github.com/apify/crawlee/issues/1583)) ([ee3a68f](https://github.com/apify/crawlee/commit/ee3a68fff1fcdf941c9a1d3734107635e9a12049))
* **playwright:** disable animations when taking screenshots ([#1601](https://github.com/apify/crawlee/issues/1601)) ([4e63034](https://github.com/apify/crawlee/commit/4e63034c7b87de405edbd84f9b1803aa101f5c78))


# [3.1.0](https://github.com/apify/crawlee/compare/v3.0.4...v3.1.0) (2022-10-13)


### Bug Fixes

* add overload for `KeyValueStore.getValue` with defaultValue ([#1541](https://github.com/apify/crawlee/issues/1541)) ([e3cb509](https://github.com/apify/crawlee/commit/e3cb509cb433e72e058b08a323dc7564e858f547))
* add retry attempts to methods in CLI ([#1588](https://github.com/apify/crawlee/issues/1588)) ([9142e59](https://github.com/apify/crawlee/commit/9142e598de68cc86d82825823c87b82a52c7b305))
* allow `label` in `enqueueLinksByClickingElements` options ([#1525](https://github.com/apify/crawlee/issues/1525)) ([18b7c25](https://github.com/apify/crawlee/commit/18b7c25592eaaa4a9f97cacc6e7154528ce54bf6))
* **basic-crawler:** handle `request.noRetry` after `errorHandler` ([#1542](https://github.com/apify/crawlee/issues/1542)) ([2a2040e](https://github.com/apify/crawlee/commit/2a2040e13209aff5e64ee47194940182b686b3a7))
* build storage classes by using `this` instead of the class ([#1596](https://github.com/apify/crawlee/issues/1596)) ([2b14eb7](https://github.com/apify/crawlee/commit/2b14eb7240d10760518e047095766084a3d255e3))
* correct some typing exports ([#1527](https://github.com/apify/crawlee/issues/1527)) ([4a136e5](https://github.com/apify/crawlee/commit/4a136e59e128f0a80ad4a1b98b87449647f23f43))
* do not hide stack trace of (retried) Type/Syntax/ReferenceErrors ([469b4b5](https://github.com/apify/crawlee/commit/469b4b58f1c19699d05da84f5f09a95d682421f0))
* **enqueueLinks:** ensure the enqueue strategy is respected alongside user patterns ([#1509](https://github.com/apify/crawlee/issues/1509)) ([2b0eeed](https://github.com/apify/crawlee/commit/2b0eeed3c5b0a69265f7d0567028e5707af4835b))
* **enqueueLinks:** prevent useless request creations when filtering by user patterns ([#1510](https://github.com/apify/crawlee/issues/1510)) ([cb8fe36](https://github.com/apify/crawlee/commit/cb8fe3664db1bd4cba9c2b2185e96bceddabb333))
* export `Cookie` from `crawlee` metapackage ([7b02ceb](https://github.com/apify/crawlee/commit/7b02cebc6920da9bd36d63802df0f7d6abec3887))
* handle redirect cookies ([#1521](https://github.com/apify/crawlee/issues/1521)) ([2f7fc7c](https://github.com/apify/crawlee/commit/2f7fc7cc1d27553d94a915667f0e6d2af599a80c))
* **http-crawler:** do not hang on POST without payload ([#1546](https://github.com/apify/crawlee/issues/1546)) ([8c87390](https://github.com/apify/crawlee/commit/8c87390e0db1924f463019cc55dfc265b12db2a9))
* remove undeclared dependency on core package from puppeteer utils ([827ae60](https://github.com/apify/crawlee/commit/827ae60d6c77e8c7271408493c3750a67ef8a9b4))
* support TypeScript 4.8 ([#1507](https://github.com/apify/crawlee/issues/1507)) ([4c3a504](https://github.com/apify/crawlee/commit/4c3a5045931a7f270bf8eda8a6417466b32fc99b))
* wait for persist state listeners to run when event manager closes ([#1481](https://github.com/apify/crawlee/issues/1481)) ([aa550ed](https://github.com/apify/crawlee/commit/aa550edf7e016497e8e0323e18b14bf32b416155))


### Features

* add `Dataset.exportToValue` ([#1553](https://github.com/apify/crawlee/issues/1553)) ([acc6344](https://github.com/apify/crawlee/commit/acc6344f0e52854b4c4c833dbf7aede2547c111e))
* add `Dataset.getData()` shortcut ([522ed6e](https://github.com/apify/crawlee/commit/522ed6e209aea4aa8285ddbb336f027a36cfb6bc))
* add `utils.downloadListOfUrls` to crawlee metapackage ([7b33b0a](https://github.com/apify/crawlee/commit/7b33b0a582a75758cfca53e3ed92d6d3e392b601))
* add `utils.parseOpenGraph()` ([#1555](https://github.com/apify/crawlee/issues/1555)) ([059f85e](https://github.com/apify/crawlee/commit/059f85ebe577888d448b196f89d0f4ec1dff371e))
* add `utils.playwright.compileScript` ([#1559](https://github.com/apify/crawlee/issues/1559)) ([2e14162](https://github.com/apify/crawlee/commit/2e141625f27aa58e2195ab37ed2e31691b58f4c0))
* add `utils.playwright.infiniteScroll` ([#1543](https://github.com/apify/crawlee/issues/1543)) ([60c8289](https://github.com/apify/crawlee/commit/60c8289571f3b6bce908ef7d1636b59faebdbf87)), closes [#1528](https://github.com/apify/crawlee/issues/1528)
* add `utils.playwright.saveSnapshot` ([#1544](https://github.com/apify/crawlee/issues/1544)) ([a4ceef0](https://github.com/apify/crawlee/commit/a4ceef044f0c5afdfd964dd1163a260463a60f52))
* add global `useState` helper ([#1551](https://github.com/apify/crawlee/issues/1551)) ([2b03177](https://github.com/apify/crawlee/commit/2b0317772a2bb0d29b73ff86719caf9db394d507))
* add static `Dataset.exportToValue` ([#1564](https://github.com/apify/crawlee/issues/1564)) ([a7c17d4](https://github.com/apify/crawlee/commit/a7c17d434559785d66c1220d22ea79961bda2eec))
* allow disabling storage persistence ([#1539](https://github.com/apify/crawlee/issues/1539)) ([f65e3c6](https://github.com/apify/crawlee/commit/f65e3c6a7e1efc02fac5f32046bb27da5a1c8e78))
* bump puppeteer support to 17.x ([#1519](https://github.com/apify/crawlee/issues/1519)) ([b97a852](https://github.com/apify/crawlee/commit/b97a85282b64cfb6d48b0aa71f5cc79525a80295))
* **core:** add `forefront` option to `enqueueLinks` helper ([f8755b6](https://github.com/apify/crawlee/commit/f8755b633212138671a76a8d5e0af17c12d46e10)), closes [#1595](https://github.com/apify/crawlee/issues/1595)
* don't close page before calling errorHandler ([#1548](https://github.com/apify/crawlee/issues/1548)) ([1c8cd82](https://github.com/apify/crawlee/commit/1c8cd82611e93e4991b49b8ba2f1842457875680))
* enqueue links by clicking for Playwright ([#1545](https://github.com/apify/crawlee/issues/1545)) ([3d25ade](https://github.com/apify/crawlee/commit/3d25adefa7570433a9fa636941684bc2701b8ddd))
* error tracker ([#1467](https://github.com/apify/crawlee/issues/1467)) ([6bfe1ce](https://github.com/apify/crawlee/commit/6bfe1ce0161f1e26f97e2b8e5c02ec9ca608fe30))
* make the CLI download directly from GitHub ([#1540](https://github.com/apify/crawlee/issues/1540)) ([3ff398a](https://github.com/apify/crawlee/commit/3ff398a2f114760d33c43b5bc0c2447e2e48a72e))
* **router:** add userdata generic to addHandler ([#1547](https://github.com/apify/crawlee/issues/1547)) ([19cdf13](https://github.com/apify/crawlee/commit/19cdf1380abdf9aa8f337a96a4666f8f650bad69))
* use JSON5 for `INPUT.json` to support comments ([#1538](https://github.com/apify/crawlee/issues/1538)) ([09133ff](https://github.com/apify/crawlee/commit/09133ffa744436b60fc452b4f97caf1a18ebfced))



## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)

### Features

* bump puppeteer support to 15.1


### Bug Fixes

* key value stores emitting an error when multiple write promises ran in parallel ([#1460](https://github.com/apify/crawlee/issues/1460)) ([f201cca](https://github.com/apify/crawlee/commit/f201cca4a99d1c8b3e87be0289d5b3b363048f09))
* fix dockerfiles in project templates



## [3.0.3](https://github.com/apify/crawlee/compare/v3.0.2...v3.0.3) (2022-08-11)

### Fixes

* add missing configuration to CheerioCrawler constructor ([#1432](https://github.com/apify/crawlee/pull/1432))
* sendRequest types ([#1445](https://github.com/apify/crawlee/pull/1445))
* respect `headless` option in browser crawlers ([#1455](https://github.com/apify/crawlee/pull/1455))
* make `CheerioCrawlerOptions` type more loose ([d871d8c](https://github.com/apify/crawlee/commit/d871d8caf22bc8d8ca1041e4975f3c95eae4b487))
* improve dockerfiles and project templates ([7c21a64](https://github.com/apify/crawlee/commit/7c21a646360d10453f17380f9882ac52d06fedb6))

### Features

* add `utils.playwright.blockRequests()` ([#1447](https://github.com/apify/crawlee/pull/1447))
* http-crawler ([#1440](https://github.com/apify/crawlee/pull/1440))
* prefer `/INPUT.json` files for `KeyValueStore.getInput()` ([#1453](https://github.com/apify/crawlee/pull/1453))
* jsdom-crawler ([#1451](https://github.com/apify/crawlee/pull/1451))
* add `RetryRequestError` + add error to the context for BC ([#1443](https://github.com/apify/crawlee/pull/1443))
* add `keepAlive` to crawler options ([#1452](https://github.com/apify/crawlee/pull/1452))


## [3.0.2](https://github.com/apify/crawlee/compare/v3.0.1...v3.0.2) (2022-07-28)

### Fixes

* regression in resolving the base url for enqueue link filtering ([1422](https://github.com/apify/crawlee/pull/1422))
* improve file saving on memory storage ([1421](https://github.com/apify/crawlee/pull/1421))
* add `UserData` type argument to `CheerioCrawlingContext` and related interfaces ([1424](https://github.com/apify/crawlee/pull/1424))
* always limit `desiredConcurrency` to the value of `maxConcurrency` ([bcb689d](https://github.com/apify/crawlee/commit/bcb689d4cb90835136295d879e710969ebaf29fa))
* wait for storage to finish before resolving `crawler.run()` ([9d62d56](https://github.com/apify/crawlee/commit/9d62d565c2ff8d058164c22333b07b7d2bf79ee0))
* using explicitly typed router with `CheerioCrawler` ([07b7e69](https://github.com/apify/crawlee/commit/07b7e69e1a7b7c89b8a5538279eb6de8be0effde))
* declare dependency on `ow` in `@crawlee/cheerio` package ([be59f99](https://github.com/apify/crawlee/commit/be59f992d2897ce5c02349bbcc62472d99bb2718))
* use `crawlee@^3.0.0` in the CLI templates ([6426f22](https://github.com/apify/crawlee/commit/6426f22ce53fcce91b1d8686577557bae09fc0e9))
* fix building projects with TS when puppeteer and playwright are not installed ([1404](https://github.com/apify/crawlee/pull/1404))
* enqueueLinks should respect full URL of the current request for relative link resolution ([1427](https://github.com/apify/crawlee/pull/1427))
* use `desiredConcurrency: 10` as the default for `CheerioCrawler` ([1428](https://github.com/apify/crawlee/pull/1428))

### Features

* feat: allow configuring what status codes will cause session retirement ([1423](https://github.com/apify/crawlee/pull/1423))
* feat: add support for middlewares to the `Router` via `use` method ([1431](https://github.com/apify/crawlee/pull/1431))


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

See [the Got Scraping guide](https://crawlee.dev/docs/guides/got-scraping).

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

### Handling requests outside of browser

One small feature worth mentioning is the ability to handle requests with browser crawlers outside the browser. To do that, we can use a combination of `Request.skipNavigation` and `context.sendRequest()`.

Take a look at how to achieve this by checking out the [Skipping navigation for certain requests](https://crawlee.dev/docs/examples/skip-navigation) example!

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

Apify SDK (v2) exports `Apify.events`, which is an `EventEmitter` instance. With Crawlee, the events are managed by [`EventManager`](https://crawlee.dev/api/core/class/EventManager) class instead. We can either access it via `Actor.eventManager` getter, or use `Actor.on` and `Actor.off` shortcuts instead.

```diff
-Apify.events.on(...);
+Actor.on(...);
```

> We can also get the [`EventManager`](https://crawlee.dev/api/core/class/EventManager) instance via `Configuration.getEventManager()`.

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

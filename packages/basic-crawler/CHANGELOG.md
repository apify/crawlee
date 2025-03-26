# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.13.0](https://github.com/apify/crawlee/compare/v3.12.2...v3.13.0) (2025-03-04)


### Bug Fixes

* Simplified RequestQueueV2 implementation ([#2775](https://github.com/apify/crawlee/issues/2775)) ([d1a094a](https://github.com/apify/crawlee/commit/d1a094a47eaecbf367b222f9b8c14d7da5d3e03a)), closes [#2767](https://github.com/apify/crawlee/issues/2767) [#2700](https://github.com/apify/crawlee/issues/2700)





## [3.12.2](https://github.com/apify/crawlee/compare/v3.12.1...v3.12.2) (2025-01-27)


### Bug Fixes

* destructure `CrawlerRunOptions` before passing them to `addRequests` ([#2803](https://github.com/apify/crawlee/issues/2803)) ([02a598c](https://github.com/apify/crawlee/commit/02a598c2a501957f04ca3a2362bcee289ef861c0)), closes [#2802](https://github.com/apify/crawlee/issues/2802)
* graceful `BasicCrawler` tidy-up on `CriticalError` ([#2817](https://github.com/apify/crawlee/issues/2817)) ([53331e8](https://github.com/apify/crawlee/commit/53331e82ee66274316add7cadb4afec1ce2d4bcf)), closes [#2807](https://github.com/apify/crawlee/issues/2807)


### Features

* stopping the crawlers gracefully with `BasicCrawler.stop()` ([#2792](https://github.com/apify/crawlee/issues/2792)) ([af2966f](https://github.com/apify/crawlee/commit/af2966f65caeaf4273fd0a8ab583a7857e4330ab)), closes [#2777](https://github.com/apify/crawlee/issues/2777)





## [3.12.1](https://github.com/apify/crawlee/compare/v3.12.0...v3.12.1) (2024-12-04)


### Bug Fixes

* log status message timeouts to debug level ([55ee44a](https://github.com/apify/crawlee/commit/55ee44aaf5e73c2a9d96d973a4aae111ab2e0025))





# [3.12.0](https://github.com/apify/crawlee/compare/v3.11.5...v3.12.0) (2024-11-04)


### Features

* allow using other HTTP clients ([#2661](https://github.com/apify/crawlee/issues/2661)) ([568c655](https://github.com/apify/crawlee/commit/568c6556d79ce91654c8a715d1d1729d7d6ed8ef)), closes [#2659](https://github.com/apify/crawlee/issues/2659)





## [3.11.5](https://github.com/apify/crawlee/compare/v3.11.4...v3.11.5) (2024-10-04)


### Bug Fixes

* check `.isFinished()` before `RequestList` reads ([#2695](https://github.com/apify/crawlee/issues/2695)) ([6fa170f](https://github.com/apify/crawlee/commit/6fa170fbe16c326307b8a58c09c07f64afb64bb2))
* **core:** trigger `errorHandler` for session errors ([#2683](https://github.com/apify/crawlee/issues/2683)) ([7d72bcb](https://github.com/apify/crawlee/commit/7d72bcb36f32933c6251382e5efd28a284e9267d)), closes [#2678](https://github.com/apify/crawlee/issues/2678)





## [3.11.4](https://github.com/apify/crawlee/compare/v3.11.3...v3.11.4) (2024-09-23)

**Note:** Version bump only for package @crawlee/basic





## [3.11.3](https://github.com/apify/crawlee/compare/v3.11.2...v3.11.3) (2024-09-03)

**Note:** Version bump only for package @crawlee/basic





## [3.11.2](https://github.com/apify/crawlee/compare/v3.11.1...v3.11.2) (2024-08-28)


### Bug Fixes

* **RequestQueueV2:** remove `inProgress` cache, rely solely on locked states ([#2601](https://github.com/apify/crawlee/issues/2601)) ([57fcb08](https://github.com/apify/crawlee/commit/57fcb0804a9f1268039d1e2b246c515ceca7e405))





## [3.11.1](https://github.com/apify/crawlee/compare/v3.11.0...v3.11.1) (2024-07-24)

**Note:** Version bump only for package @crawlee/basic





# [3.11.0](https://github.com/apify/crawlee/compare/v3.10.5...v3.11.0) (2024-07-09)


### Features

* Sitemap-based request list implementation ([#2498](https://github.com/apify/crawlee/issues/2498)) ([7bf8f0b](https://github.com/apify/crawlee/commit/7bf8f0bcd4cc81e02c7cc60e82dfe7a0cdd80938))





## [3.10.5](https://github.com/apify/crawlee/compare/v3.10.4...v3.10.5) (2024-06-12)


### Bug Fixes

* mark `context.request.loadedUrl` and `id` as required inside the request handler ([#2531](https://github.com/apify/crawlee/issues/2531)) ([2b54660](https://github.com/apify/crawlee/commit/2b546600691d84852a2f9ef42f273cecf818d66d))





## [3.10.4](https://github.com/apify/crawlee/compare/v3.10.3...v3.10.4) (2024-06-11)


### Bug Fixes

* add missing `useState` implementation into crawling context ([eec4a71](https://github.com/apify/crawlee/commit/eec4a71769f1236ca0876a4a32288241b1b63db1))
* make `crawler.log` publicly accessible ([#2526](https://github.com/apify/crawlee/issues/2526)) ([3e9e665](https://github.com/apify/crawlee/commit/3e9e6652c0b5e4d0c2707985abbad7d80336b9af))
* respect `crawler.log` when creating child logger for `Statistics` ([0a0d75d](https://github.com/apify/crawlee/commit/0a0d75d40b5f78b329589535bbe3e0e84be76a7e)), closes [#2412](https://github.com/apify/crawlee/issues/2412)





## [3.10.3](https://github.com/apify/crawlee/compare/v3.10.2...v3.10.3) (2024-06-07)


### Features

* log desired concurrency in the default status message ([9f0b796](https://github.com/apify/crawlee/commit/9f0b79684d9e27e6ba29634e7da2e9a095367eda))





## [3.10.2](https://github.com/apify/crawlee/compare/v3.10.1...v3.10.2) (2024-06-03)

**Note:** Version bump only for package @crawlee/basic





## [3.10.1](https://github.com/apify/crawlee/compare/v3.10.0...v3.10.1) (2024-05-23)

**Note:** Version bump only for package @crawlee/basic





# [3.10.0](https://github.com/apify/crawlee/compare/v3.9.2...v3.10.0) (2024-05-16)


### Bug Fixes

* `EnqueueStrategy.All` erroring with links using unsupported protocols ([#2389](https://github.com/apify/crawlee/issues/2389)) ([8db3908](https://github.com/apify/crawlee/commit/8db39080b7711ba3c27dff7fce1170ddb0ee3d05))
* do not drop statistics on migration/resurrection/resume ([#2462](https://github.com/apify/crawlee/issues/2462)) ([8ce7dd4](https://github.com/apify/crawlee/commit/8ce7dd4ae6a3718dac95e784a53bd5661c827edc))


### Features

* implement ErrorSnapshotter for error context capture ([#2332](https://github.com/apify/crawlee/issues/2332)) ([e861dfd](https://github.com/apify/crawlee/commit/e861dfdb451ae32fb1e0c7749c6b59744654b303)), closes [#2280](https://github.com/apify/crawlee/issues/2280)
* make `RequestQueue` v2 the default queue, see more on [Apify blog](https://blog.apify.com/new-apify-request-queue/) ([#2390](https://github.com/apify/crawlee/issues/2390)) ([41ae8ab](https://github.com/apify/crawlee/commit/41ae8abec1da811ae0750ac2d298e77c1e3b7b55)), closes [#2388](https://github.com/apify/crawlee/issues/2388)





## [3.9.2](https://github.com/apify/crawlee/compare/v3.9.1...v3.9.2) (2024-04-17)


### Bug Fixes

* don't call `notify` in `addRequests()` ([#2425](https://github.com/apify/crawlee/issues/2425)) ([c4d5446](https://github.com/apify/crawlee/commit/c4d54469120648a592b6898f849154fda60e3d59)), closes [#2421](https://github.com/apify/crawlee/issues/2421)





## [3.9.1](https://github.com/apify/crawlee/compare/v3.9.0...v3.9.1) (2024-04-11)

**Note:** Version bump only for package @crawlee/basic





# [3.9.0](https://github.com/apify/crawlee/compare/v3.8.2...v3.9.0) (2024-04-10)


### Bug Fixes

* notify autoscaled pool about newly added requests ([#2400](https://github.com/apify/crawlee/issues/2400)) ([a90177d](https://github.com/apify/crawlee/commit/a90177d5207794be1d6e401d746dd4c6e5961976))


### Features

* `tieredProxyUrls` for ProxyConfiguration ([#2348](https://github.com/apify/crawlee/issues/2348)) ([5408c7f](https://github.com/apify/crawlee/commit/5408c7f60a5bf4dbdba92f2d7440e0946b94ea6e))





## [3.8.2](https://github.com/apify/crawlee/compare/v3.8.1...v3.8.2) (2024-03-21)

**Note:** Version bump only for package @crawlee/basic





## [3.8.1](https://github.com/apify/crawlee/compare/v3.8.0...v3.8.1) (2024-02-22)

**Note:** Version bump only for package @crawlee/basic





# [3.8.0](https://github.com/apify/crawlee/compare/v3.7.3...v3.8.0) (2024-02-21)


### Bug Fixes

* declare missing dependencies on `csv-stringify` and `fs-extra` ([#2326](https://github.com/apify/crawlee/issues/2326)) ([718959d](https://github.com/apify/crawlee/commit/718959dbbe1fa69f948d0b778d0f54d9c493ab25)), closes [/github.com/redabacha/crawlee/blob/2f05ed22b203f688095300400bb0e6d03a03283c/.eslintrc.json#L50](https://github.com//github.com/redabacha/crawlee/blob/2f05ed22b203f688095300400bb0e6d03a03283c/.eslintrc.json/issues/L50)


### Features

* accessing crawler state, key-value store and named datasets via crawling context ([#2283](https://github.com/apify/crawlee/issues/2283)) ([58dd5fc](https://github.com/apify/crawlee/commit/58dd5fcc25f31bb066402c46e48a9e5e91efd5c5))
* adaptive playwright crawler ([#2316](https://github.com/apify/crawlee/issues/2316)) ([8e4218a](https://github.com/apify/crawlee/commit/8e4218ada03cf485751def46f8c465b2d2a825c7))





## [3.7.3](https://github.com/apify/crawlee/compare/v3.7.2...v3.7.3) (2024-01-30)

**Note:** Version bump only for package @crawlee/basic





## [3.7.2](https://github.com/apify/crawlee/compare/v3.7.1...v3.7.2) (2024-01-09)

**Note:** Version bump only for package @crawlee/basic





## [3.7.1](https://github.com/apify/crawlee/compare/v3.7.0...v3.7.1) (2024-01-02)

**Note:** Version bump only for package @crawlee/basic





# [3.7.0](https://github.com/apify/crawlee/compare/v3.6.2...v3.7.0) (2023-12-21)


### Features

* allow configuring crawler statistics ([#2213](https://github.com/apify/crawlee/issues/2213)) ([9fd60e4](https://github.com/apify/crawlee/commit/9fd60e4036dce720c71f2d169a8eccbc4c813a96)), closes [#1789](https://github.com/apify/crawlee/issues/1789)
* check enqueue link strategy post redirect ([#2238](https://github.com/apify/crawlee/issues/2238)) ([3c5f9d6](https://github.com/apify/crawlee/commit/3c5f9d6056158e042e12d75b2b1b21ef6c32e618)), closes [#2173](https://github.com/apify/crawlee/issues/2173)
* log cause with `retryOnBlocked` ([#2252](https://github.com/apify/crawlee/issues/2252)) ([e19a773](https://github.com/apify/crawlee/commit/e19a773693cfc5e65c1e2321bfc8b73c9844ea8b)), closes [#2249](https://github.com/apify/crawlee/issues/2249)





## [3.6.2](https://github.com/apify/crawlee/compare/v3.6.1...v3.6.2) (2023-11-26)

**Note:** Version bump only for package @crawlee/basic





## [3.6.1](https://github.com/apify/crawlee/compare/v3.6.0...v3.6.1) (2023-11-15)

**Note:** Version bump only for package @crawlee/basic





# [3.6.0](https://github.com/apify/crawlee/compare/v3.5.8...v3.6.0) (2023-11-15)


### Features

* **core:** add `crawler.exportData()` helper ([#2166](https://github.com/apify/crawlee/issues/2166)) ([c8c09a5](https://github.com/apify/crawlee/commit/c8c09a54a712689969ff1f6bddf70f12a2a22670))
* got-scraping v4 ([#2110](https://github.com/apify/crawlee/issues/2110)) ([2f05ed2](https://github.com/apify/crawlee/commit/2f05ed22b203f688095300400bb0e6d03a03283c))





## [3.5.8](https://github.com/apify/crawlee/compare/v3.5.7...v3.5.8) (2023-10-17)

**Note:** Version bump only for package @crawlee/basic





## [3.5.7](https://github.com/apify/crawlee/compare/v3.5.6...v3.5.7) (2023-10-05)


### Bug Fixes

* add warning when we detect use of RL and RQ, but RQ is not provided explicitly ([#2115](https://github.com/apify/crawlee/issues/2115)) ([6fb1c55](https://github.com/apify/crawlee/commit/6fb1c5568a0bf3b6fa38045161866a32b13310ca)), closes [#1773](https://github.com/apify/crawlee/issues/1773)
* ensure the status message cannot stuck the crawler ([#2114](https://github.com/apify/crawlee/issues/2114)) ([9034f08](https://github.com/apify/crawlee/commit/9034f08106f53a70205695076e874f04f632c5bb))
* RQ request count is consistent after migration ([#2116](https://github.com/apify/crawlee/issues/2116)) ([9ab8c18](https://github.com/apify/crawlee/commit/9ab8c1874f52acc3f0337fdabd36321d0fb40b86)), closes [#1855](https://github.com/apify/crawlee/issues/1855) [#1855](https://github.com/apify/crawlee/issues/1855)





## [3.5.6](https://github.com/apify/crawlee/compare/v3.5.5...v3.5.6) (2023-10-04)

**Note:** Version bump only for package @crawlee/basic





## [3.5.5](https://github.com/apify/crawlee/compare/v3.5.4...v3.5.5) (2023-10-02)


### Bug Fixes

* session pool leaks memory on multiple crawler runs ([#2083](https://github.com/apify/crawlee/issues/2083)) ([b96582a](https://github.com/apify/crawlee/commit/b96582a200e25ec11124da1f7f84a2b16b64d133)), closes [#2074](https://github.com/apify/crawlee/issues/2074) [#2031](https://github.com/apify/crawlee/issues/2031)


### Features

* Request Queue v2 ([#1975](https://github.com/apify/crawlee/issues/1975)) ([70a77ee](https://github.com/apify/crawlee/commit/70a77ee15f984e9ae67cd584fc58ace7e55346db)), closes [#1365](https://github.com/apify/crawlee/issues/1365)





## [3.5.4](https://github.com/apify/crawlee/compare/v3.5.3...v3.5.4) (2023-09-11)


### Features

* remove side effect from the deprecated error context augmentation ([#2069](https://github.com/apify/crawlee/issues/2069)) ([f9fb5c4](https://github.com/apify/crawlee/commit/f9fb5c42ecb14f8d0845a15982d204bd2b5b228f))





## [3.5.3](https://github.com/apify/crawlee/compare/v3.5.2...v3.5.3) (2023-08-31)


### Bug Fixes

* **browser-pool:** improve error handling when browser is not found ([#2050](https://github.com/apify/crawlee/issues/2050)) ([282527f](https://github.com/apify/crawlee/commit/282527f31bb366a4e52463212f652dcf6679b6c3)), closes [#1459](https://github.com/apify/crawlee/issues/1459)
* clean up `inProgress` cache when delaying requests via `sameDomainDelaySecs` ([#2045](https://github.com/apify/crawlee/issues/2045)) ([f63ccc0](https://github.com/apify/crawlee/commit/f63ccc018c9e9046531287c47d11283a8e71a6ad))
* pin all internal dependencies ([#2041](https://github.com/apify/crawlee/issues/2041)) ([d6f2b17](https://github.com/apify/crawlee/commit/d6f2b172d4a6776137c7893ca798d5b4a9408e79)), closes [#2040](https://github.com/apify/crawlee/issues/2040)
* respect current config when creating implicit `RequestQueue` instance ([845141d](https://github.com/apify/crawlee/commit/845141d921c10dd5fb121a499bb1b24f5eb3ff04)), closes [#2043](https://github.com/apify/crawlee/issues/2043)


### Features

* **core:** add default dataset helpers to `BasicCrawler` ([#2057](https://github.com/apify/crawlee/issues/2057)) ([e2a7544](https://github.com/apify/crawlee/commit/e2a7544ddf775db023ca25553d21cb73484fcd8c))





## [3.5.2](https://github.com/apify/crawlee/compare/v3.5.1...v3.5.2) (2023-08-21)

**Note:** Version bump only for package @crawlee/basic





## [3.5.1](https://github.com/apify/crawlee/compare/v3.5.0...v3.5.1) (2023-08-16)


### Features

* exceeding maxSessionRotations calls failedRequestHandler ([#2029](https://github.com/apify/crawlee/issues/2029)) ([b1cb108](https://github.com/apify/crawlee/commit/b1cb108882ab28d956adfc3d77ba9813507823f6)), closes [#2028](https://github.com/apify/crawlee/issues/2028)





# [3.5.0](https://github.com/apify/crawlee/compare/v3.4.2...v3.5.0) (2023-07-31)


### Features

* add support for `sameDomainDelay` ([#2003](https://github.com/apify/crawlee/issues/2003)) ([e796883](https://github.com/apify/crawlee/commit/e79688324790e5d07fc11192769cf051617e96e4)), closes [#1993](https://github.com/apify/crawlee/issues/1993)
* **basic-crawler:** allow configuring the automatic status message ([#2001](https://github.com/apify/crawlee/issues/2001)) ([3eb4e4c](https://github.com/apify/crawlee/commit/3eb4e4c558b4bc0673fbff75b1db19c46004a1da))
* retire session on proxy error ([#2002](https://github.com/apify/crawlee/issues/2002)) ([8c0928b](https://github.com/apify/crawlee/commit/8c0928b24ceabefc454f8114ac30a27023709010)), closes [#1912](https://github.com/apify/crawlee/issues/1912)





## [3.4.2](https://github.com/apify/crawlee/compare/v3.4.1...v3.4.2) (2023-07-19)


### Bug Fixes

* **basic-crawler:** limit `internalTimeoutMillis` in addition to `requestHandlerTimeoutMillis` ([#1981](https://github.com/apify/crawlee/issues/1981)) ([8122622](https://github.com/apify/crawlee/commit/8122622c3054a0e0e0c1869ba462276cbead8090)), closes [#1766](https://github.com/apify/crawlee/issues/1766)


### Features

* **core:** add `RequestQueue.addRequestsBatched()` that is non-blocking ([#1996](https://github.com/apify/crawlee/issues/1996)) ([c85485d](https://github.com/apify/crawlee/commit/c85485d6ca2bb61cfebb24a2ad99e0b3ba5c069b)), closes [#1995](https://github.com/apify/crawlee/issues/1995)
* retryOnBlocked detects blocked webpage ([#1956](https://github.com/apify/crawlee/issues/1956)) ([766fa9b](https://github.com/apify/crawlee/commit/766fa9b88029e9243a7427075384c1abe85c70c8))





## [3.4.1](https://github.com/apify/crawlee/compare/v3.4.0...v3.4.1) (2023-07-13)

**Note:** Version bump only for package @crawlee/basic





# [3.4.0](https://github.com/apify/crawlee/compare/v3.3.3...v3.4.0) (2023-06-12)

**Note:** Version bump only for package @crawlee/basic





## [3.3.3](https://github.com/apify/crawlee/compare/v3.3.2...v3.3.3) (2023-05-31)


### Bug Fixes

* set status message every 5 seconds and log it via debug level ([#1918](https://github.com/apify/crawlee/issues/1918)) ([32aede6](https://github.com/apify/crawlee/commit/32aede6bbaa25b402e6e9cee9d3aa44722b1cfd0))


### Features

* **core:** add `Request.maxRetries` to allow overriding the `maxRequestRetries` ([#1925](https://github.com/apify/crawlee/issues/1925)) ([c5592db](https://github.com/apify/crawlee/commit/c5592db0f8094de27c46ad993bea2c1ab1f61385))





## [3.3.2](https://github.com/apify/crawlee/compare/v3.3.1...v3.3.2) (2023-05-11)


### Bug Fixes

* respect config object when creating `SessionPool` ([#1881](https://github.com/apify/crawlee/issues/1881)) ([db069df](https://github.com/apify/crawlee/commit/db069df80bc183c6b861c9ac82f1e278e57ea92b))


### Features

* allow running single crawler instance multiple times ([#1844](https://github.com/apify/crawlee/issues/1844)) ([9e6eb1e](https://github.com/apify/crawlee/commit/9e6eb1e32f582a8837311aac12cc1d657432f3fa)), closes [#765](https://github.com/apify/crawlee/issues/765)
* **router:** allow inline router definition ([#1877](https://github.com/apify/crawlee/issues/1877)) ([2d241c9](https://github.com/apify/crawlee/commit/2d241c9f88964ebd41a181069c378b6b7b5bf262))





## [3.3.1](https://github.com/apify/crawlee/compare/v3.3.0...v3.3.1) (2023-04-11)


### Bug Fixes

* start status message logger after the crawl actually starts ([5d1df7a](https://github.com/apify/crawlee/commit/5d1df7aae00d0d6ca29338723f92b77cff667354))
* status message - total requests ([#1842](https://github.com/apify/crawlee/issues/1842)) ([710f734](https://github.com/apify/crawlee/commit/710f7347623619057e99abf539f0ccf78de41bbc))





# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)


### Features

* add basic support for `setStatusMessage` ([#1790](https://github.com/apify/crawlee/issues/1790)) ([c318980](https://github.com/apify/crawlee/commit/c318980ec11d211b1a5c9e6bdbe76198c5d895be))
* move the status message implementation to Crawlee, noop in storage ([#1808](https://github.com/apify/crawlee/issues/1808)) ([99c3fdc](https://github.com/apify/crawlee/commit/99c3fdc18030b7898e6b6d149d6d94fab7881f09))





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)

**Note:** Version bump only for package @crawlee/basic





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)

**Note:** Version bump only for package @crawlee/basic





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* declare missing dependency on `tslib` ([27e96c8](https://github.com/apify/crawlee/commit/27e96c80c26e7fc31809a4b518d699573cb8c662)), closes [#1747](https://github.com/apify/crawlee/issues/1747)





## [3.1.4](https://github.com/apify/crawlee/compare/v3.1.3...v3.1.4) (2022-12-14)


### Bug Fixes

* session.markBad() on requestHandler error ([#1709](https://github.com/apify/crawlee/issues/1709)) ([e87eb1f](https://github.com/apify/crawlee/commit/e87eb1f2ccd9585f8d53cb03ec671cedf23a06b4)), closes [#1635](https://github.com/apify/crawlee/issues/1635) [/github.com/apify/crawlee/blob/5ff04faa85c3a6b6f02cd58a91b46b80610d8ae6/packages/browser-crawler/src/internals/browser-crawler.ts#L524](https://github.com//github.com/apify/crawlee/blob/5ff04faa85c3a6b6f02cd58a91b46b80610d8ae6/packages/browser-crawler/src/internals/browser-crawler.ts/issues/L524)





## [3.1.3](https://github.com/apify/crawlee/compare/v3.1.2...v3.1.3) (2022-12-07)


### Bug Fixes

* remove memory leaks from migration event handling ([#1679](https://github.com/apify/crawlee/issues/1679)) ([49bba25](https://github.com/apify/crawlee/commit/49bba252ebc348b61eac3895155361f7d394db36)), closes [#1670](https://github.com/apify/crawlee/issues/1670)


### Features

* always show error origin if inside the userland ([#1677](https://github.com/apify/crawlee/issues/1677)) ([bbe9045](https://github.com/apify/crawlee/commit/bbe9045d550f95138d570522f6f469eae2d146d0))





## 3.1.2 (2022-11-15)

**Note:** Version bump only for package @crawlee/basic





## 3.1.1 (2022-11-07)

**Note:** Version bump only for package @crawlee/basic





# 3.1.0 (2022-10-13)

**Note:** Version bump only for package @crawlee/basic





## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)

**Note:** Version bump only for package @crawlee/basic

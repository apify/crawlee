# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.13.0](https://github.com/apify/crawlee/compare/v3.12.2...v3.13.0) (2025-03-04)


### Bug Fixes

* **cheerio:** don't decode HTML entities in `context.body` ([#2838](https://github.com/apify/crawlee/issues/2838)) ([32d6d0e](https://github.com/apify/crawlee/commit/32d6d0ee7e7eaad1a401f4884926f31e0f68cc55)), closes [#2401](https://github.com/apify/crawlee/issues/2401)
* install browser in the `camoufox` template correctly ([#2864](https://github.com/apify/crawlee/issues/2864)) ([a9d008c](https://github.com/apify/crawlee/commit/a9d008c6f36a6cb1b6bc827cb0323ed9d6f6b536)), closes [#2863](https://github.com/apify/crawlee/issues/2863)
* Make log message in RequestQueue.isFinished more accurate ([#2848](https://github.com/apify/crawlee/issues/2848)) ([3d124ae](https://github.com/apify/crawlee/commit/3d124aee8f6fa096df0daafad4bb9d07b0ae4684))
* Simplified RequestQueueV2 implementation ([#2775](https://github.com/apify/crawlee/issues/2775)) ([d1a094a](https://github.com/apify/crawlee/commit/d1a094a47eaecbf367b222f9b8c14d7da5d3e03a)), closes [#2767](https://github.com/apify/crawlee/issues/2767) [#2700](https://github.com/apify/crawlee/issues/2700)


### Features

* Camoufox-based crawler template ([#2842](https://github.com/apify/crawlee/issues/2842)) ([7f08de4](https://github.com/apify/crawlee/commit/7f08de4c73812cb957828dec9946ca7f385739e4)), closes [#2836](https://github.com/apify/crawlee/issues/2836)
* improved cross platform metric collection ([#2834](https://github.com/apify/crawlee/issues/2834)) ([e41b2f7](https://github.com/apify/crawlee/commit/e41b2f744513dd80aa05336eedfa1c08c54d3832)), closes [#2771](https://github.com/apify/crawlee/issues/2771)
* **playwright:** add `handleCloudflareChallenge` helper ([#2865](https://github.com/apify/crawlee/issues/2865)) ([9a1725f](https://github.com/apify/crawlee/commit/9a1725f7b87fb70194fc31858500cb35639fb964))
* remove old docker CI ([#2831](https://github.com/apify/crawlee/issues/2831)) ([7f09d56](https://github.com/apify/crawlee/commit/7f09d56ed5776d92a11feee3a5e61255301d0099))
* use native `impit` streaming ([#2833](https://github.com/apify/crawlee/issues/2833)) ([af2fe23](https://github.com/apify/crawlee/commit/af2fe2315b3b36e7e2466f452c1df9c63abd156b)), closes [#2756](https://github.com/apify/crawlee/issues/2756)





## [3.12.2](https://github.com/apify/crawlee/compare/v3.12.1...v3.12.2) (2025-01-27)


### Bug Fixes

* **core:** type definition of Dataset.reduce ([#2774](https://github.com/apify/crawlee/issues/2774)) ([59bc6d1](https://github.com/apify/crawlee/commit/59bc6d12cbd9e81c06ee18d0a6390b7806e346ae)), closes [#2773](https://github.com/apify/crawlee/issues/2773)
* destructure `CrawlerRunOptions` before passing them to `addRequests` ([#2803](https://github.com/apify/crawlee/issues/2803)) ([02a598c](https://github.com/apify/crawlee/commit/02a598c2a501957f04ca3a2362bcee289ef861c0)), closes [#2802](https://github.com/apify/crawlee/issues/2802)
* graceful `BasicCrawler` tidy-up on `CriticalError` ([#2817](https://github.com/apify/crawlee/issues/2817)) ([53331e8](https://github.com/apify/crawlee/commit/53331e82ee66274316add7cadb4afec1ce2d4bcf)), closes [#2807](https://github.com/apify/crawlee/issues/2807)


### Features

* `impit`-based `HttpClient` implementation ([#2787](https://github.com/apify/crawlee/issues/2787)) ([61d7ffa](https://github.com/apify/crawlee/commit/61d7ffae8aff8dd4451fea63ecc0d25c243a6271))
* add support for parsing comma-separated list environment variables ([#2765](https://github.com/apify/crawlee/issues/2765)) ([4e50c47](https://github.com/apify/crawlee/commit/4e50c474f60df66585c6decf07532c790c8e63a7))
* stopping the crawlers gracefully with `BasicCrawler.stop()` ([#2792](https://github.com/apify/crawlee/issues/2792)) ([af2966f](https://github.com/apify/crawlee/commit/af2966f65caeaf4273fd0a8ab583a7857e4330ab)), closes [#2777](https://github.com/apify/crawlee/issues/2777)





## [3.12.1](https://github.com/apify/crawlee/compare/v3.12.0...v3.12.1) (2024-12-04)


### Bug Fixes

* log status message timeouts to debug level ([55ee44a](https://github.com/apify/crawlee/commit/55ee44aaf5e73c2a9d96d973a4aae111ab2e0025))
* **social:** support new URL formats for Facebook, YouTube and X ([#2758](https://github.com/apify/crawlee/issues/2758)) ([4c95847](https://github.com/apify/crawlee/commit/4c95847d5cedd6514620ccab31d5b242ba76de80)), closes [#525](https://github.com/apify/crawlee/issues/525)


### Features

* `tieredProxyUrls` accept `null` for switching the proxy off ([#2743](https://github.com/apify/crawlee/issues/2743)) ([82f4ea9](https://github.com/apify/crawlee/commit/82f4ea99f632526649ad73e3246b9bdf63a6788a)), closes [#2740](https://github.com/apify/crawlee/issues/2740)





# [3.12.0](https://github.com/apify/crawlee/compare/v3.11.5...v3.12.0) (2024-11-04)


### Bug Fixes

* `.trim()` urls from pretty-printed sitemap.xml files ([#2709](https://github.com/apify/crawlee/issues/2709)) ([802a6fe](https://github.com/apify/crawlee/commit/802a6fea7b2125e2b36d740fc2d5d131de5d53ed)), closes [#2698](https://github.com/apify/crawlee/issues/2698)
* ensure correct column order in CSV export ([#2734](https://github.com/apify/crawlee/issues/2734)) ([b66784f](https://github.com/apify/crawlee/commit/b66784f89f011c2f972d73ec9cd47235a0411d1c)), closes [#2718](https://github.com/apify/crawlee/issues/2718)
* ignore errors from iframe content extraction ([#2714](https://github.com/apify/crawlee/issues/2714)) ([627e5c2](https://github.com/apify/crawlee/commit/627e5c2fbadce63c7e631217cd0e735597c0ce08)), closes [#2708](https://github.com/apify/crawlee/issues/2708)
* update `fingerprintGeneratorOptions` types ([#2705](https://github.com/apify/crawlee/issues/2705)) ([fcb098d](https://github.com/apify/crawlee/commit/fcb098d6357b69e6d1790765076e4fe4146c8143)), closes [#2703](https://github.com/apify/crawlee/issues/2703)


### Features

* allow using other HTTP clients ([#2661](https://github.com/apify/crawlee/issues/2661)) ([568c655](https://github.com/apify/crawlee/commit/568c6556d79ce91654c8a715d1d1729d7d6ed8ef)), closes [#2659](https://github.com/apify/crawlee/issues/2659)





## [3.11.5](https://github.com/apify/crawlee/compare/v3.11.4...v3.11.5) (2024-10-04)


### Bug Fixes

* `forefront` request fetching in RQv2 ([#2689](https://github.com/apify/crawlee/issues/2689)) ([03951bd](https://github.com/apify/crawlee/commit/03951bdba8fb34f6bed00d1b68240ff7cd0bacbf)), closes [#2669](https://github.com/apify/crawlee/issues/2669)
* `prolong-` and `deleteRequestLock` `forefront` option ([#2690](https://github.com/apify/crawlee/issues/2690)) ([cba8da3](https://github.com/apify/crawlee/commit/cba8da31312bcc4228662c79c4472e35278627c1)), closes [#2681](https://github.com/apify/crawlee/issues/2681) [#2689](https://github.com/apify/crawlee/issues/2689) [#2669](https://github.com/apify/crawlee/issues/2669)
* check `.isFinished()` before `RequestList` reads ([#2695](https://github.com/apify/crawlee/issues/2695)) ([6fa170f](https://github.com/apify/crawlee/commit/6fa170fbe16c326307b8a58c09c07f64afb64bb2))
* **core:** accept `UInt8Array` in `KVS.setValue()` ([#2682](https://github.com/apify/crawlee/issues/2682)) ([8ef0e60](https://github.com/apify/crawlee/commit/8ef0e60ca6fb2f4ec1b0d1aec6dcd53fcfb398b3))
* **core:** trigger `errorHandler` for session errors ([#2683](https://github.com/apify/crawlee/issues/2683)) ([7d72bcb](https://github.com/apify/crawlee/commit/7d72bcb36f32933c6251382e5efd28a284e9267d)), closes [#2678](https://github.com/apify/crawlee/issues/2678)
* decode special characters in proxy `username` and `password` ([#2696](https://github.com/apify/crawlee/issues/2696)) ([0f0fcc5](https://github.com/apify/crawlee/commit/0f0fcc594685a29472b407a7c39d48b21f24375a))
* **http-crawler:** avoid crashing when gotOptions.cache is on ([#2686](https://github.com/apify/crawlee/issues/2686)) ([1106d3a](https://github.com/apify/crawlee/commit/1106d3aeccd9d1aca8b2630d720d3ea6a1c955f6))
* **puppeteer:** rename `ignoreHTTPSErrors` to `acceptInsecureCerts` to support v23 ([#2684](https://github.com/apify/crawlee/issues/2684)) ([f3927e6](https://github.com/apify/crawlee/commit/f3927e6c3487deef4a2a6b0face04d3742ecd5dd))
* respect `forefront` option in `MemoryStorage`'s `RequestQueue` ([#2681](https://github.com/apify/crawlee/issues/2681)) ([b0527f9](https://github.com/apify/crawlee/commit/b0527f948b73e3b74ac77e58f9184b34c1adab3a)), closes [#2669](https://github.com/apify/crawlee/issues/2669)





## [3.11.4](https://github.com/apify/crawlee/compare/v3.11.3...v3.11.4) (2024-09-23)


### Bug Fixes

* `SitemapRequestList.teardown()` doesn't break `persistState` calls ([#2673](https://github.com/apify/crawlee/issues/2673)) ([fb2c5cd](https://github.com/apify/crawlee/commit/fb2c5cdaa47e2d3a91ade726cfba3091917a0137)), closes [/github.com/apify/crawlee/blob/f3eb99d9fa9a7aa0ec1dcb9773e666a9ac14fb76/packages/core/src/storages/sitemap_request_list.ts#L446](https://github.com//github.com/apify/crawlee/blob/f3eb99d9fa9a7aa0ec1dcb9773e666a9ac14fb76/packages/core/src/storages/sitemap_request_list.ts/issues/L446) [#2672](https://github.com/apify/crawlee/issues/2672)





## [3.11.3](https://github.com/apify/crawlee/compare/v3.11.2...v3.11.3) (2024-09-03)


### Bug Fixes

* improve `FACEBOOK_REGEX` to match older style page URLs ([#2650](https://github.com/apify/crawlee/issues/2650)) ([a005e69](https://github.com/apify/crawlee/commit/a005e699682cbf4bb2e48ff92cf2bbf3e0d2be26)), closes [#2216](https://github.com/apify/crawlee/issues/2216)
* **RequestQueueV2:** reset recently handled cache too if the queue is pending for too long ([#2656](https://github.com/apify/crawlee/issues/2656)) ([51a69bc](https://github.com/apify/crawlee/commit/51a69bc1f2084c4d7ef3b7bdab3695b77af29540))





## [3.11.2](https://github.com/apify/crawlee/compare/v3.11.1...v3.11.2) (2024-08-28)


### Bug Fixes

* **RequestQueueV2:** remove `inProgress` cache, rely solely on locked states ([#2601](https://github.com/apify/crawlee/issues/2601)) ([57fcb08](https://github.com/apify/crawlee/commit/57fcb0804a9f1268039d1e2b246c515ceca7e405))
* use namespace imports for cheerio to be compatible with v1 ([#2641](https://github.com/apify/crawlee/issues/2641)) ([f48296f](https://github.com/apify/crawlee/commit/f48296f6cba7b81fe102d4b874505c27f93d9fc1))
* Use the correct mutex in memory storage RequestQueueClient ([#2623](https://github.com/apify/crawlee/issues/2623)) ([2fa8a29](https://github.com/apify/crawlee/commit/2fa8a29b815689f041f3d06cc0563e77e02e05f4))


### Features

* `globs` & `regexps` for `SitemapRequestList` ([#2631](https://github.com/apify/crawlee/issues/2631)) ([b5fd3a9](https://github.com/apify/crawlee/commit/b5fd3a9e3f6b189b86c0fb89a37b66c08ff3fe5d))
* resilient sitemap loading ([#2619](https://github.com/apify/crawlee/issues/2619)) ([1dd7660](https://github.com/apify/crawlee/commit/1dd76601e03de4541964116b3a77376e233ea22b))





## [3.11.1](https://github.com/apify/crawlee/compare/v3.11.0...v3.11.1) (2024-07-24)


### Bug Fixes

* use `getHTML` in the shadow root expansion ([#2587](https://github.com/apify/crawlee/issues/2587)) ([a244d62](https://github.com/apify/crawlee/commit/a244d62cca03d628677eca8a5adcf41e33c51dee)), closes [#2583](https://github.com/apify/crawlee/issues/2583)





# [3.11.0](https://github.com/apify/crawlee/compare/v3.10.5...v3.11.0) (2024-07-09)


### Features

* add `iframe` expansion to `parseWithCheerio` in browsers ([#2542](https://github.com/apify/crawlee/issues/2542)) ([328d085](https://github.com/apify/crawlee/commit/328d08598807782b3712bd543e394fe9a000a85d)), closes [#2507](https://github.com/apify/crawlee/issues/2507)
* add `ignoreIframes` opt-out from the Cheerio iframe expansion ([#2562](https://github.com/apify/crawlee/issues/2562)) ([474a8dc](https://github.com/apify/crawlee/commit/474a8dc06a567cde0651d385fdac9c350ddf4508))
* Sitemap-based request list implementation ([#2498](https://github.com/apify/crawlee/issues/2498)) ([7bf8f0b](https://github.com/apify/crawlee/commit/7bf8f0bcd4cc81e02c7cc60e82dfe7a0cdd80938))





## [3.10.5](https://github.com/apify/crawlee/compare/v3.10.4...v3.10.5) (2024-06-12)


### Bug Fixes

* allow creating new adaptive crawler instance without any parameters ([9b7f595](https://github.com/apify/crawlee/commit/9b7f595a2d70cab5c50e188581b21b0ef7e51780))
* declare missing peer dependencies in `@crawlee/browser` package ([#2532](https://github.com/apify/crawlee/issues/2532)) ([3357c7f](https://github.com/apify/crawlee/commit/3357c7fc5ab071b12f72097c190dbee9990e3751))
* fix detection of HTTP site when using the `useState` in adaptive crawler ([#2530](https://github.com/apify/crawlee/issues/2530)) ([7e195c1](https://github.com/apify/crawlee/commit/7e195c17cf1d9beae7f6f068fe505f1334a3a5b3))
* mark `context.request.loadedUrl` and `id` as required inside the request handler ([#2531](https://github.com/apify/crawlee/issues/2531)) ([2b54660](https://github.com/apify/crawlee/commit/2b546600691d84852a2f9ef42f273cecf818d66d))





## [3.10.4](https://github.com/apify/crawlee/compare/v3.10.3...v3.10.4) (2024-06-11)


### Bug Fixes

* add `waitForAllRequestsToBeAdded` option to `enqueueLinks` helper ([925546b](https://github.com/apify/crawlee/commit/925546b31130076c2dec98a83a42d15c216589a0)), closes [#2318](https://github.com/apify/crawlee/issues/2318)
* add missing `useState` implementation into crawling context ([eec4a71](https://github.com/apify/crawlee/commit/eec4a71769f1236ca0876a4a32288241b1b63db1))
* make `crawler.log` publicly accessible ([#2526](https://github.com/apify/crawlee/issues/2526)) ([3e9e665](https://github.com/apify/crawlee/commit/3e9e6652c0b5e4d0c2707985abbad7d80336b9af))
* **playwright:** allow passing new context options in `launchOptions` on type level ([0519d40](https://github.com/apify/crawlee/commit/0519d4099d257bbc40ed091c131a674ea5f8d731)), closes [#1849](https://github.com/apify/crawlee/issues/1849)
* respect `crawler.log` when creating child logger for `Statistics` ([0a0d75d](https://github.com/apify/crawlee/commit/0a0d75d40b5f78b329589535bbe3e0e84be76a7e)), closes [#2412](https://github.com/apify/crawlee/issues/2412)





## [3.10.3](https://github.com/apify/crawlee/compare/v3.10.2...v3.10.3) (2024-06-07)


### Bug Fixes

* **adaptive-crawler:** log only once for the committed request handler execution ([#2524](https://github.com/apify/crawlee/issues/2524)) ([533bd3f](https://github.com/apify/crawlee/commit/533bd3f04671d54273f0861664d316269d08fbfb))
* increase timeout for retiring inactive browsers ([#2523](https://github.com/apify/crawlee/issues/2523)) ([195f176](https://github.com/apify/crawlee/commit/195f1766a03293db19caa33f9fc3d4ab08081f71))
* respect implicit router when no `requestHandler` is provided in `AdaptiveCrawler` ([#2518](https://github.com/apify/crawlee/issues/2518)) ([31083aa](https://github.com/apify/crawlee/commit/31083aa27ddd51827f73c7ac4290379ec7a81283))
* revert the scaling steps back to 5% ([5bf32f8](https://github.com/apify/crawlee/commit/5bf32f855ad84037e68dd9053930fa7be4267cac))


### Features

* add `waitForSelector` context helper + `parseWithCheerio` in adaptive crawler ([#2522](https://github.com/apify/crawlee/issues/2522)) ([6f88e73](https://github.com/apify/crawlee/commit/6f88e738d43ab4774dc4ef3f78775a5d88728e0d))
* log desired concurrency in the default status message ([9f0b796](https://github.com/apify/crawlee/commit/9f0b79684d9e27e6ba29634e7da2e9a095367eda))





## [3.10.2](https://github.com/apify/crawlee/compare/v3.10.1...v3.10.2) (2024-06-03)


### Bug Fixes

* Autodetect sitemap filetype from content ([#2497](https://github.com/apify/crawlee/issues/2497)) ([62a9f40](https://github.com/apify/crawlee/commit/62a9f4036dba92d07547af489ac8b6c7974faa6f)), closes [#2461](https://github.com/apify/crawlee/issues/2461)
* improve fix for double extension in KVS with HTML files ([#2505](https://github.com/apify/crawlee/issues/2505)) ([157927d](https://github.com/apify/crawlee/commit/157927d67f42342c20fdf01ef81bdafd7095f0b8)), closes [#2419](https://github.com/apify/crawlee/issues/2419)


### Features

* Loading sitemaps from string ([#2496](https://github.com/apify/crawlee/issues/2496)) ([38ed0d6](https://github.com/apify/crawlee/commit/38ed0d6ad90a868df9c02632334fec8db9ef29a0)), closes [#2460](https://github.com/apify/crawlee/issues/2460)





## [3.10.1](https://github.com/apify/crawlee/compare/v3.10.0...v3.10.1) (2024-05-23)


### Bug Fixes

* adjust `URL_NO_COMMAS_REGEX` regexp to allow single character hostnames ([#2492](https://github.com/apify/crawlee/issues/2492)) ([ec802e8](https://github.com/apify/crawlee/commit/ec802e85f54022616e5bdcc1a6fd1bd43e1b3ace)), closes [#2487](https://github.com/apify/crawlee/issues/2487)
* investigate and temp fix for possible 0-concurrency bug in RQv2 ([#2494](https://github.com/apify/crawlee/issues/2494)) ([4ebe820](https://github.com/apify/crawlee/commit/4ebe820573b269c2d0a6eff20cfd7787debc63c0))
* provide URLs to the error snapshot ([#2482](https://github.com/apify/crawlee/issues/2482)) ([7f64145](https://github.com/apify/crawlee/commit/7f64145308dfdb3909d4fcf945759a7d6344e2f5)), closes [/github.com/apify/apify-sdk-js/blob/master/packages/apify/src/key_value_store.ts#L25](https://github.com//github.com/apify/apify-sdk-js/blob/master/packages/apify/src/key_value_store.ts/issues/L25)





# [3.10.0](https://github.com/apify/crawlee/compare/v3.9.2...v3.10.0) (2024-05-16)


### Bug Fixes

* `EnqueueStrategy.All` erroring with links using unsupported protocols ([#2389](https://github.com/apify/crawlee/issues/2389)) ([8db3908](https://github.com/apify/crawlee/commit/8db39080b7711ba3c27dff7fce1170ddb0ee3d05))
* conversion between tough cookies and browser pool cookies ([#2443](https://github.com/apify/crawlee/issues/2443)) ([74f73ab](https://github.com/apify/crawlee/commit/74f73ab77a94ecd285d587b7b3532443deda07b4))
* fire local `SystemInfo` events every second ([#2454](https://github.com/apify/crawlee/issues/2454)) ([1fa9a66](https://github.com/apify/crawlee/commit/1fa9a66388846505f84dcdea0393e7eaaebf84c3))
* use createSessionFunction when loading Session from persisted state ([#2444](https://github.com/apify/crawlee/issues/2444)) ([3c56b4c](https://github.com/apify/crawlee/commit/3c56b4ca1efe327138aeb32c39dfd9dd67b6aceb))
* do not drop statistics on migration/resurrection/resume ([#2462](https://github.com/apify/crawlee/issues/2462)) ([8ce7dd4](https://github.com/apify/crawlee/commit/8ce7dd4ae6a3718dac95e784a53bd5661c827edc))
* double tier decrement in tiered proxy ([#2468](https://github.com/apify/crawlee/issues/2468)) ([3a8204b](https://github.com/apify/crawlee/commit/3a8204ba417936570ec5569dc4e4eceed79939c1))
* Fixed double extension for screenshots ([#2419](https://github.com/apify/crawlee/issues/2419)) ([e8b39c4](https://github.com/apify/crawlee/commit/e8b39c41764726280c995e52fa7d79a9240d993e)), closes [#1980](https://github.com/apify/crawlee/issues/1980)
* malformed sitemap url when sitemap index child contains querystring ([#2430](https://github.com/apify/crawlee/issues/2430)) ([e4cd41c](https://github.com/apify/crawlee/commit/e4cd41c49999af270fbe2476a61d92c8e3502463))
* return true when robots.isAllowed returns undefined ([#2439](https://github.com/apify/crawlee/issues/2439)) ([6f541f8](https://github.com/apify/crawlee/commit/6f541f8c4ea9b1e94eb506383019397676fd79fe)), closes [#2437](https://github.com/apify/crawlee/issues/2437)
* sitemap `content-type` check breaks on `content-type` parameters ([#2442](https://github.com/apify/crawlee/issues/2442)) ([db7d372](https://github.com/apify/crawlee/commit/db7d37256a49820e3e584165fff42377042ec258))


### Features

* add `FileDownload` "crawler" ([#2435](https://github.com/apify/crawlee/issues/2435)) ([d73756b](https://github.com/apify/crawlee/commit/d73756bb225d9ed8f58cf0a3b2e0ce96f6188863))
* implement ErrorSnapshotter for error context capture ([#2332](https://github.com/apify/crawlee/issues/2332)) ([e861dfd](https://github.com/apify/crawlee/commit/e861dfdb451ae32fb1e0c7749c6b59744654b303)), closes [#2280](https://github.com/apify/crawlee/issues/2280)
* make `RequestQueue` v2 the default queue, see more on [Apify blog](https://blog.apify.com/new-apify-request-queue/) ([#2390](https://github.com/apify/crawlee/issues/2390)) ([41ae8ab](https://github.com/apify/crawlee/commit/41ae8abec1da811ae0750ac2d298e77c1e3b7b55)), closes [#2388](https://github.com/apify/crawlee/issues/2388)


### Performance Improvements

* improve scaling based on memory ([#2459](https://github.com/apify/crawlee/issues/2459)) ([2d5d443](https://github.com/apify/crawlee/commit/2d5d443da5fa701b21aec003d4d84797882bc175))
* optimize `RequestList` memory footprint ([#2466](https://github.com/apify/crawlee/issues/2466)) ([12210bd](https://github.com/apify/crawlee/commit/12210bd191b50c76ecca23ea18f3deda7b1517c6))
* optimize adding large amount of requests via `crawler.addRequests()` ([#2456](https://github.com/apify/crawlee/issues/2456)) ([6da86a8](https://github.com/apify/crawlee/commit/6da86a85d848cd1cf860a28e5f077b8b14cdb213))





## [3.9.2](https://github.com/apify/crawlee/compare/v3.9.1...v3.9.2) (2024-04-17)


### Bug Fixes

* break up growing stack in `AutoscaledPool.notify` ([#2422](https://github.com/apify/crawlee/issues/2422)) ([6f2e6b0](https://github.com/apify/crawlee/commit/6f2e6b0ccb404ae66be372e87d762eed67c053bb)), closes [#2421](https://github.com/apify/crawlee/issues/2421)
* don't call `notify` in `addRequests()` ([#2425](https://github.com/apify/crawlee/issues/2425)) ([c4d5446](https://github.com/apify/crawlee/commit/c4d54469120648a592b6898f849154fda60e3d59)), closes [#2421](https://github.com/apify/crawlee/issues/2421)


### Features

* **sitemap:** Support CDATA in sitemaps ([#2424](https://github.com/apify/crawlee/issues/2424)) ([635f046](https://github.com/apify/crawlee/commit/635f046b7933e0ad1b0ee627a22a9adaf21847d3))





## [3.9.1](https://github.com/apify/crawlee/compare/v3.9.0...v3.9.1) (2024-04-11)


### Features

* `browserPerProxy` browser launch option ([#2418](https://github.com/apify/crawlee/issues/2418)) ([df57b29](https://github.com/apify/crawlee/commit/df57b2965ac8c8b3adf807e3bad8a649814fa213))





# [3.9.0](https://github.com/apify/crawlee/compare/v3.8.2...v3.9.0) (2024-04-10)


### Bug Fixes

* include actual key in error message of KVS' `setValue` ([#2411](https://github.com/apify/crawlee/issues/2411)) ([9089bf1](https://github.com/apify/crawlee/commit/9089bf139b717fecc6e8220c65a4d389862bd073))
* notify autoscaled pool about newly added requests ([#2400](https://github.com/apify/crawlee/issues/2400)) ([a90177d](https://github.com/apify/crawlee/commit/a90177d5207794be1d6e401d746dd4c6e5961976))
* **puppeteer:** allow passing `networkidle` to `waitUntil` in `gotoExtended` ([#2399](https://github.com/apify/crawlee/issues/2399)) ([5d0030d](https://github.com/apify/crawlee/commit/5d0030d24858585715b0fac5568440f2b2346706)), closes [#2398](https://github.com/apify/crawlee/issues/2398)
* sitemaps support `application/xml` ([#2408](https://github.com/apify/crawlee/issues/2408)) ([cbcf47a](https://github.com/apify/crawlee/commit/cbcf47a7b991a8b88a6c2a46f3684444d776fcdd))


### Features

* `createAdaptivePlaywrightRouter` utility ([#2415](https://github.com/apify/crawlee/issues/2415)) ([cee4778](https://github.com/apify/crawlee/commit/cee477814e4901d025c5376205ad884c2fe08e0e)), closes [#2407](https://github.com/apify/crawlee/issues/2407)
* `tieredProxyUrls` for ProxyConfiguration ([#2348](https://github.com/apify/crawlee/issues/2348)) ([5408c7f](https://github.com/apify/crawlee/commit/5408c7f60a5bf4dbdba92f2d7440e0946b94ea6e))
* better `newUrlFunction` for ProxyConfiguration ([#2392](https://github.com/apify/crawlee/issues/2392)) ([330598b](https://github.com/apify/crawlee/commit/330598b348ad27bc7c73732294a14b655ccd3507)), closes [#2348](https://github.com/apify/crawlee/issues/2348) [#2065](https://github.com/apify/crawlee/issues/2065)
* expand #shadow-root elements automatically in `parseWithCheerio` helper ([#2396](https://github.com/apify/crawlee/issues/2396)) ([a05b3a9](https://github.com/apify/crawlee/commit/a05b3a93a9b57926b353df0e79d846b5024c42ac))





## [3.8.2](https://github.com/apify/crawlee/compare/v3.8.1...v3.8.2) (2024-03-21)


### Bug Fixes

* **core:** solve possible dead locks in `RequestQueueV2` ([#2376](https://github.com/apify/crawlee/issues/2376)) ([ffba095](https://github.com/apify/crawlee/commit/ffba095c8a74075901268cc49d970af4271d7abf))
* correctly report gzip decompression errors ([#2368](https://github.com/apify/crawlee/issues/2368)) ([84a2f17](https://github.com/apify/crawlee/commit/84a2f1733033bf247b2cede3f1728e75bf2c8ff9))
* fix detection of older puppeteer versions ([890669b](https://github.com/apify/crawlee/commit/890669b0b3eef94d00ad69aa022e13b3109a660c)), closes [#2370](https://github.com/apify/crawlee/issues/2370)
* **puppeteer:** improve detection of older versions ([98d4e86](https://github.com/apify/crawlee/commit/98d4e8664a54c1a134446a1b6ab9042d14ed8629))
* use 0 (number) instead of false as default for sessionRotationCount ([#2372](https://github.com/apify/crawlee/issues/2372)) ([667a3e7](https://github.com/apify/crawlee/commit/667a3e7a2be31abb94adbdb6119c4a8f3a751d69))


### Features

* implement global storage access checking and use it to prevent unwanted side effects in adaptive crawler ([#2371](https://github.com/apify/crawlee/issues/2371)) ([fb3b7da](https://github.com/apify/crawlee/commit/fb3b7da402522ddff8c7394ac1253ba8aeac984c)), closes [#2364](https://github.com/apify/crawlee/issues/2364)





## [3.8.1](https://github.com/apify/crawlee/compare/v3.8.0...v3.8.1) (2024-02-22)


### Bug Fixes

* fix crawling context type in `router.addHandler()` ([#2355](https://github.com/apify/crawlee/issues/2355)) ([d73c202](https://github.com/apify/crawlee/commit/d73c20240586aeeddaea99cd157771a01b61d917))





# [3.8.0](https://github.com/apify/crawlee/compare/v3.7.3...v3.8.0) (2024-02-21)


### Bug Fixes

* `createRequests` works correctly with `exclude` (and nothing else) ([#2321](https://github.com/apify/crawlee/issues/2321)) ([048db09](https://github.com/apify/crawlee/commit/048db0964a57ac570320ad495425733128235491))
* declare missing dependencies on `csv-stringify` and `fs-extra` ([#2326](https://github.com/apify/crawlee/issues/2326)) ([718959d](https://github.com/apify/crawlee/commit/718959dbbe1fa69f948d0b778d0f54d9c493ab25)), closes [/github.com/redabacha/crawlee/blob/2f05ed22b203f688095300400bb0e6d03a03283c/.eslintrc.json#L50](https://github.com//github.com/redabacha/crawlee/blob/2f05ed22b203f688095300400bb0e6d03a03283c/.eslintrc.json/issues/L50)
* **puppeteer:** add 'process' to the browser bound methods ([#2329](https://github.com/apify/crawlee/issues/2329)) ([2750ba6](https://github.com/apify/crawlee/commit/2750ba646ef3c1d51eacdd8e7d67be0e14fb2a97))
* **puppeteer:** replace `page.waitForTimeout()` with `sleep()` ([52d7219](https://github.com/apify/crawlee/commit/52d7219acdc19b34a727e5d26f7f9288d27ca57f)), closes [#2335](https://github.com/apify/crawlee/issues/2335)
* **puppeteer:** support `puppeteer@v22` ([#2337](https://github.com/apify/crawlee/issues/2337)) ([3cc360a](https://github.com/apify/crawlee/commit/3cc360a1ea94147133f9785d65834f360f7b42a7))


### Features

* `KeyValueStore.recordExists()` ([#2339](https://github.com/apify/crawlee/issues/2339)) ([8507a65](https://github.com/apify/crawlee/commit/8507a65d1ad079f64c752a6ddb1d8fac9b494228))
* accessing crawler state, key-value store and named datasets via crawling context ([#2283](https://github.com/apify/crawlee/issues/2283)) ([58dd5fc](https://github.com/apify/crawlee/commit/58dd5fcc25f31bb066402c46e48a9e5e91efd5c5))
* adaptive playwright crawler ([#2316](https://github.com/apify/crawlee/issues/2316)) ([8e4218a](https://github.com/apify/crawlee/commit/8e4218ada03cf485751def46f8c465b2d2a825c7))
* add Sitemap.tryCommonNames to check well known sitemap locations ([#2311](https://github.com/apify/crawlee/issues/2311)) ([85589f1](https://github.com/apify/crawlee/commit/85589f167196ac49c0cc10664ab3e9e5595208ed)), closes [#2307](https://github.com/apify/crawlee/issues/2307)
* **ci:** snapshot docs automatically on minor/major publish ([#2344](https://github.com/apify/crawlee/issues/2344)) ([092f51e](https://github.com/apify/crawlee/commit/092f51e8e85d22953686897d7508e9c0c9af08ad))
* **core:** add `userAgent` parameter to `RobotsFile.isAllowed()` + `RobotsFile.from()` helper ([#2338](https://github.com/apify/crawlee/issues/2338)) ([343c159](https://github.com/apify/crawlee/commit/343c159f20546a2006db33da4674e6ffd77db572))
* Support plain-text sitemap files (sitemap.txt) ([#2315](https://github.com/apify/crawlee/issues/2315)) ([0bee7da](https://github.com/apify/crawlee/commit/0bee7daf9509fe61c8d83799e706f0bb030257ec))





## [3.7.3](https://github.com/apify/crawlee/compare/v3.7.2...v3.7.3) (2024-01-30)


### Bug Fixes

* **enqueueLinks:** filter out empty/nullish globs ([#2286](https://github.com/apify/crawlee/issues/2286)) ([84319b3](https://github.com/apify/crawlee/commit/84319b39efb5a921d0d5ec785db0147ec47f1243))
* pass on an invisible CF turnstile ([#2277](https://github.com/apify/crawlee/issues/2277)) ([d8734e7](https://github.com/apify/crawlee/commit/d8734e765238115d9cba6dda9c649ad8573890d8)), closes [#2256](https://github.com/apify/crawlee/issues/2256)





## [3.7.2](https://github.com/apify/crawlee/compare/v3.7.1...v3.7.2) (2024-01-09)


### Bug Fixes

* **RequestQueue:** always clear locks when a request is reclaimed ([#2263](https://github.com/apify/crawlee/issues/2263)) ([0fafe29](https://github.com/apify/crawlee/commit/0fafe290103655d450c61da78522491efde8a866)), closes [#2262](https://github.com/apify/crawlee/issues/2262)





## [3.7.1](https://github.com/apify/crawlee/compare/v3.7.0...v3.7.1) (2024-01-02)


### Bug Fixes

* ES2022 build compatibility and move to NodeNext for module ([#2258](https://github.com/apify/crawlee/issues/2258)) ([7fe1e68](https://github.com/apify/crawlee/commit/7fe1e685904660c8446aafdf739fd1212684b48c)), closes [#2257](https://github.com/apify/crawlee/issues/2257)





# [3.7.0](https://github.com/apify/crawlee/compare/v3.6.2...v3.7.0) (2023-12-21)


### Bug Fixes

* `retryOnBlocked` doesn't override the blocked HTTP codes ([#2243](https://github.com/apify/crawlee/issues/2243)) ([81672c3](https://github.com/apify/crawlee/commit/81672c3d1db1dcdcffb868de5740addff82cf112))
* **browser-pool:** respect user options before assigning fingerprints ([#2190](https://github.com/apify/crawlee/issues/2190)) ([f050776](https://github.com/apify/crawlee/commit/f050776a916a0530aca6727a447a49252e643417)), closes [#2164](https://github.com/apify/crawlee/issues/2164)
* filter out empty globs ([#2205](https://github.com/apify/crawlee/issues/2205)) ([41322ab](https://github.com/apify/crawlee/commit/41322ab32d7db7baf61638d00fd7eaec9e5330f1)), closes [#2200](https://github.com/apify/crawlee/issues/2200)
* make CLI work on Windows too with `--no-purge` ([#2244](https://github.com/apify/crawlee/issues/2244)) ([83f3179](https://github.com/apify/crawlee/commit/83f3179d6963dbaca4232d866356cc766db11dd8))
* make SessionPool queue up getSession calls to prevent overruns ([#2239](https://github.com/apify/crawlee/issues/2239)) ([0f5665c](https://github.com/apify/crawlee/commit/0f5665c473371bff5a5d3abee3c3a9d23f2aeb23)), closes [#1667](https://github.com/apify/crawlee/issues/1667)
* **MemoryStorage:** lock request JSON file when reading to support multiple process crawling ([#2215](https://github.com/apify/crawlee/issues/2215)) ([eb84ce9](https://github.com/apify/crawlee/commit/eb84ce9ce5540b72d5799b1f66c80938d57bc1cc))


### Features

* allow configuring crawler statistics ([#2213](https://github.com/apify/crawlee/issues/2213)) ([9fd60e4](https://github.com/apify/crawlee/commit/9fd60e4036dce720c71f2d169a8eccbc4c813a96)), closes [#1789](https://github.com/apify/crawlee/issues/1789)
* check enqueue link strategy post redirect ([#2238](https://github.com/apify/crawlee/issues/2238)) ([3c5f9d6](https://github.com/apify/crawlee/commit/3c5f9d6056158e042e12d75b2b1b21ef6c32e618)), closes [#2173](https://github.com/apify/crawlee/issues/2173)
* log cause with `retryOnBlocked` ([#2252](https://github.com/apify/crawlee/issues/2252)) ([e19a773](https://github.com/apify/crawlee/commit/e19a773693cfc5e65c1e2321bfc8b73c9844ea8b)), closes [#2249](https://github.com/apify/crawlee/issues/2249)
* robots.txt and sitemap.xml utils ([#2214](https://github.com/apify/crawlee/issues/2214)) ([fdfec4f](https://github.com/apify/crawlee/commit/fdfec4f4d0a0f925b49015d2d63932c4a82555ba)), closes [#2187](https://github.com/apify/crawlee/issues/2187)





## [3.6.2](https://github.com/apify/crawlee/compare/v3.6.1...v3.6.2) (2023-11-26)


### Bug Fixes

* prevent race condition in KeyValueStore.getAutoSavedValue() ([#2193](https://github.com/apify/crawlee/issues/2193)) ([e340e2b](https://github.com/apify/crawlee/commit/e340e2b8764968d22a22bd67769676b9f2f1a2fb))





## [3.6.1](https://github.com/apify/crawlee/compare/v3.6.0...v3.6.1) (2023-11-15)


### Bug Fixes

* **ts:** ignore import errors for `got-scraping` ([012fc9e](https://github.com/apify/crawlee/commit/012fc9eaf0fef886aac4fdde1f3061147fdc28b1))
* **ts:** specify type explicitly for logger ([aec3550](https://github.com/apify/crawlee/commit/aec355022eb13f2624eeba20aeeb42dc0ad8365c))


### Features

* **puppeteer:** enable `new` headless mode ([#1910](https://github.com/apify/crawlee/issues/1910)) ([7fc999c](https://github.com/apify/crawlee/commit/7fc999cf4658ca69b97f16d434444081998470f4))





# [3.6.0](https://github.com/apify/crawlee/compare/v3.5.8...v3.6.0) (2023-11-15)


### Bug Fixes

* add `skipNavigation` option to `enqueueLinks` ([#2153](https://github.com/apify/crawlee/issues/2153)) ([118515d](https://github.com/apify/crawlee/commit/118515d2ba534b99be2f23436f6abe41d66a8e07))
* **BrowserPool:** ignore `--no-sandbox` flag for webkit launcher ([#2148](https://github.com/apify/crawlee/issues/2148)) ([1eb2f08](https://github.com/apify/crawlee/commit/1eb2f08a3cdead5dd21ffde4162d403175a4594c)), closes [#1797](https://github.com/apify/crawlee/issues/1797)
* **core:** respect some advanced options for `RequestList.open()` + improve docs ([#2158](https://github.com/apify/crawlee/issues/2158)) ([c5a1b07](https://github.com/apify/crawlee/commit/c5a1b07ad62957fbe2cf90938d1f27b1ca54534a))
* declare missing dependency on got-scraping in the core package ([cd2fd4d](https://github.com/apify/crawlee/commit/cd2fd4d584c3c23ea4f74c9b2f363a55200594c9))
* e2e cheerio-throw-on-ssl-errors ([#2154](https://github.com/apify/crawlee/issues/2154)) ([f2d333d](https://github.com/apify/crawlee/commit/f2d333de6c8b1679f534bb7b32257f079e55ccb9))
* provide more detailed error messages for browser launch errors ([#2157](https://github.com/apify/crawlee/issues/2157)) ([f188ebe](https://github.com/apify/crawlee/commit/f188ebe0b4ae7594225ef37d8160d175d4535ccd))
* retry incorrect Content-Type when response has blocked status code ([#2176](https://github.com/apify/crawlee/issues/2176)) ([b54fb8b](https://github.com/apify/crawlee/commit/b54fb8bb7bc3575195ee676d21e5feb8f898ef47)), closes [#1994](https://github.com/apify/crawlee/issues/1994)


### Features

* **core:** add `crawler.exportData()` helper ([#2166](https://github.com/apify/crawlee/issues/2166)) ([c8c09a5](https://github.com/apify/crawlee/commit/c8c09a54a712689969ff1f6bddf70f12a2a22670))
* got-scraping v4 ([#2110](https://github.com/apify/crawlee/issues/2110)) ([2f05ed2](https://github.com/apify/crawlee/commit/2f05ed22b203f688095300400bb0e6d03a03283c))





## [3.5.8](https://github.com/apify/crawlee/compare/v3.5.7...v3.5.8) (2023-10-17)


### Bug Fixes

* **MemoryStorage:** ignore invalid files for request queues ([#2132](https://github.com/apify/crawlee/issues/2132)) ([fa58581](https://github.com/apify/crawlee/commit/fa58581b530ef3ad89bdd71403df2d2e4f06c59f)), closes [#1985](https://github.com/apify/crawlee/issues/1985)
* refactor `extractUrls` to split the text line by line first ([#2122](https://github.com/apify/crawlee/issues/2122)) ([7265cd7](https://github.com/apify/crawlee/commit/7265cd7148bb4889d60434d671f153387fb5a4dd))





## [3.5.7](https://github.com/apify/crawlee/compare/v3.5.6...v3.5.7) (2023-10-05)


### Bug Fixes

* add warning when we detect use of RL and RQ, but RQ is not provided explicitly ([#2115](https://github.com/apify/crawlee/issues/2115)) ([6fb1c55](https://github.com/apify/crawlee/commit/6fb1c5568a0bf3b6fa38045161866a32b13310ca)), closes [#1773](https://github.com/apify/crawlee/issues/1773)
* ensure the status message cannot stuck the crawler ([#2114](https://github.com/apify/crawlee/issues/2114)) ([9034f08](https://github.com/apify/crawlee/commit/9034f08106f53a70205695076e874f04f632c5bb))
* RQ request count is consistent after migration ([#2116](https://github.com/apify/crawlee/issues/2116)) ([9ab8c18](https://github.com/apify/crawlee/commit/9ab8c1874f52acc3f0337fdabd36321d0fb40b86)), closes [#1855](https://github.com/apify/crawlee/issues/1855) [#1855](https://github.com/apify/crawlee/issues/1855)





## [3.5.6](https://github.com/apify/crawlee/compare/v3.5.5...v3.5.6) (2023-10-04)


### Bug Fixes

* **types:** re-export RequestQueueOptions as an alias to RequestProviderOptions ([#2109](https://github.com/apify/crawlee/issues/2109)) ([0900f76](https://github.com/apify/crawlee/commit/0900f76742475c19a777733462e38c5a3a9b86b7))


### Features

* add incapsula iframe selector to the blocked list ([#2111](https://github.com/apify/crawlee/issues/2111)) ([2b17d8a](https://github.com/apify/crawlee/commit/2b17d8a797dec2824a0063792aa7bd3fce8dccae)), closes [apify/store-website-content-crawler#154](https://github.com/apify/store-website-content-crawler/issues/154)





## [3.5.5](https://github.com/apify/crawlee/compare/v3.5.4...v3.5.5) (2023-10-02)


### Bug Fixes

* allow to use any version of puppeteer or playwright ([#2102](https://github.com/apify/crawlee/issues/2102)) ([0cafceb](https://github.com/apify/crawlee/commit/0cafceb2966d430dd1b2a1b619fe66da1c951f4c)), closes [#2101](https://github.com/apify/crawlee/issues/2101)
* session pool leaks memory on multiple crawler runs ([#2083](https://github.com/apify/crawlee/issues/2083)) ([b96582a](https://github.com/apify/crawlee/commit/b96582a200e25ec11124da1f7f84a2b16b64d133)), closes [#2074](https://github.com/apify/crawlee/issues/2074) [#2031](https://github.com/apify/crawlee/issues/2031)
* **templates:** install browsers on postinstall for playwright ([#2104](https://github.com/apify/crawlee/issues/2104)) ([323768b](https://github.com/apify/crawlee/commit/323768bf335000ae2a23eaa903612cbdd73aaf0a))
* **types:** make return type of RequestProvider.open and RequestQueue(v2).open strict and accurate ([#2096](https://github.com/apify/crawlee/issues/2096)) ([dfaddb9](https://github.com/apify/crawlee/commit/dfaddb920d9772985e0b54e0ce029cc7d99b1efa))


### Features

* Request Queue v2 ([#1975](https://github.com/apify/crawlee/issues/1975)) ([70a77ee](https://github.com/apify/crawlee/commit/70a77ee15f984e9ae67cd584fc58ace7e55346db)), closes [#1365](https://github.com/apify/crawlee/issues/1365)





## [3.5.4](https://github.com/apify/crawlee/compare/v3.5.3...v3.5.4) (2023-09-11)


### Bug Fixes

* **core:** allow explicit calls to `purgeDefaultStorage` to wipe the storage on each call ([#2060](https://github.com/apify/crawlee/issues/2060)) ([4831f07](https://github.com/apify/crawlee/commit/4831f073e5639fdfb058588bc23c4b673be70929))
* various helpers opening KVS now respect Configuration ([#2071](https://github.com/apify/crawlee/issues/2071)) ([59dbb16](https://github.com/apify/crawlee/commit/59dbb164699774e5a6718e98d0a4e8f630f35323))


### Features

* remove side effect from the deprecated error context augmentation ([#2069](https://github.com/apify/crawlee/issues/2069)) ([f9fb5c4](https://github.com/apify/crawlee/commit/f9fb5c42ecb14f8d0845a15982d204bd2b5b228f))





## [3.5.3](https://github.com/apify/crawlee/compare/v3.5.2...v3.5.3) (2023-08-31)


### Bug Fixes

* **browser-pool:** improve error handling when browser is not found ([#2050](https://github.com/apify/crawlee/issues/2050)) ([282527f](https://github.com/apify/crawlee/commit/282527f31bb366a4e52463212f652dcf6679b6c3)), closes [#1459](https://github.com/apify/crawlee/issues/1459)
* clean up `inProgress` cache when delaying requests via `sameDomainDelaySecs` ([#2045](https://github.com/apify/crawlee/issues/2045)) ([f63ccc0](https://github.com/apify/crawlee/commit/f63ccc018c9e9046531287c47d11283a8e71a6ad))
* crawler instances with different StorageClients do not affect each other ([#2056](https://github.com/apify/crawlee/issues/2056)) ([3f4c863](https://github.com/apify/crawlee/commit/3f4c86352bdbad1c6a8dd10a2c49a1889ca206fa))
* pin all internal dependencies ([#2041](https://github.com/apify/crawlee/issues/2041)) ([d6f2b17](https://github.com/apify/crawlee/commit/d6f2b172d4a6776137c7893ca798d5b4a9408e79)), closes [#2040](https://github.com/apify/crawlee/issues/2040)
* respect current config when creating implicit `RequestQueue` instance ([845141d](https://github.com/apify/crawlee/commit/845141d921c10dd5fb121a499bb1b24f5eb3ff04)), closes [#2043](https://github.com/apify/crawlee/issues/2043)


### Features

* **core:** add default dataset helpers to `BasicCrawler` ([#2057](https://github.com/apify/crawlee/issues/2057)) ([e2a7544](https://github.com/apify/crawlee/commit/e2a7544ddf775db023ca25553d21cb73484fcd8c))





## [3.5.2](https://github.com/apify/crawlee/compare/v3.5.1...v3.5.2) (2023-08-21)


### Bug Fixes

* make the `Request` constructor options typesafe ([#2034](https://github.com/apify/crawlee/issues/2034)) ([75e7d65](https://github.com/apify/crawlee/commit/75e7d6554a1875e80e5c54f3877bb6e3daf6cdd7))
* pin `@crawlee/*` packages versions in `crawlee` metapackage ([#2040](https://github.com/apify/crawlee/issues/2040)) ([61f91c7](https://github.com/apify/crawlee/commit/61f91c79cad38ed4415f736c4e706f27150db8ba)), closes [/github.com/apify/crawlee/pull/2002#issuecomment-1680091061](https://github.com//github.com/apify/crawlee/pull/2002/issues/issuecomment-1680091061)
* support `DELETE` requests in `HttpCrawler` ([#2039](https://github.com/apify/crawlee/issues/2039)) ([7ea5c41](https://github.com/apify/crawlee/commit/7ea5c4185b169ec933dcd8df2e85824a7e452913)), closes [#1658](https://github.com/apify/crawlee/issues/1658)


### Features

* Add options for custom HTTP error status codes ([#2035](https://github.com/apify/crawlee/issues/2035)) ([b50ef1a](https://github.com/apify/crawlee/commit/b50ef1ad51d6d7c7a71e7f40efdb2b1ef0f09291)), closes [#1711](https://github.com/apify/crawlee/issues/1711)





## [3.5.1](https://github.com/apify/crawlee/compare/v3.5.0...v3.5.1) (2023-08-16)


### Bug Fixes

* add `Request.maxRetries` to the `RequestOptions` interface ([#2024](https://github.com/apify/crawlee/issues/2024)) ([6433821](https://github.com/apify/crawlee/commit/6433821a59538b1f1cb4f29addd83a259ddda74f))
* log original error message on session rotation ([#2022](https://github.com/apify/crawlee/issues/2022)) ([8a11ffb](https://github.com/apify/crawlee/commit/8a11ffbdaef6b2fe8603aac570c3038f84c2f203))


### Features

* exceeding maxSessionRotations calls failedRequestHandler ([#2029](https://github.com/apify/crawlee/issues/2029)) ([b1cb108](https://github.com/apify/crawlee/commit/b1cb108882ab28d956adfc3d77ba9813507823f6)), closes [#2028](https://github.com/apify/crawlee/issues/2028)





# [3.5.0](https://github.com/apify/crawlee/compare/v3.4.2...v3.5.0) (2023-07-31)


### Bug Fixes

* cleanup worker stuff from memory storage to fix `vitest` ([#2004](https://github.com/apify/crawlee/issues/2004)) ([d2e098c](https://github.com/apify/crawlee/commit/d2e098cab62c700a5c58fcf43a5bcf9f492d71ec)), closes [#1999](https://github.com/apify/crawlee/issues/1999)
* **core:** add requests from URL list (`requestsFromUrl`) to the queue in batches ([418fbf8](https://github.com/apify/crawlee/commit/418fbf89d8680f8c460e37cfbf3e521f45770eb2)), closes [#1995](https://github.com/apify/crawlee/issues/1995)
* **core:** support relative links in `enqueueLinks` explicitly provided via `urls` option ([#2014](https://github.com/apify/crawlee/issues/2014)) ([cbd9d08](https://github.com/apify/crawlee/commit/cbd9d08065694b8c86e32c773875cecd41e5fcc9)), closes [#2005](https://github.com/apify/crawlee/issues/2005)


### Features

* add `closeCookieModals` context helper for Playwright and Puppeteer ([#1927](https://github.com/apify/crawlee/issues/1927)) ([98d93bb](https://github.com/apify/crawlee/commit/98d93bb6713ec219baa83db2ad2cd1d7621a3339))
* add support for `sameDomainDelay` ([#2003](https://github.com/apify/crawlee/issues/2003)) ([e796883](https://github.com/apify/crawlee/commit/e79688324790e5d07fc11192769cf051617e96e4)), closes [#1993](https://github.com/apify/crawlee/issues/1993)
* **basic-crawler:** allow configuring the automatic status message ([#2001](https://github.com/apify/crawlee/issues/2001)) ([3eb4e4c](https://github.com/apify/crawlee/commit/3eb4e4c558b4bc0673fbff75b1db19c46004a1da))
* **core:** use `RequestQueue.addBatchedRequests()` in `enqueueLinks` helper ([4d61ca9](https://github.com/apify/crawlee/commit/4d61ca934072f8bbb680c842d8b1c9a4452ee73a)), closes [#1995](https://github.com/apify/crawlee/issues/1995)
* retire session on proxy error ([#2002](https://github.com/apify/crawlee/issues/2002)) ([8c0928b](https://github.com/apify/crawlee/commit/8c0928b24ceabefc454f8114ac30a27023709010)), closes [#1912](https://github.com/apify/crawlee/issues/1912)





## [3.4.2](https://github.com/apify/crawlee/compare/v3.4.1...v3.4.2) (2023-07-19)


### Bug Fixes

* **basic-crawler:** limit `internalTimeoutMillis` in addition to `requestHandlerTimeoutMillis` ([#1981](https://github.com/apify/crawlee/issues/1981)) ([8122622](https://github.com/apify/crawlee/commit/8122622c3054a0e0e0c1869ba462276cbead8090)), closes [#1766](https://github.com/apify/crawlee/issues/1766)


### Features

* **core:** add `RequestQueue.addRequestsBatched()` that is non-blocking ([#1996](https://github.com/apify/crawlee/issues/1996)) ([c85485d](https://github.com/apify/crawlee/commit/c85485d6ca2bb61cfebb24a2ad99e0b3ba5c069b)), closes [#1995](https://github.com/apify/crawlee/issues/1995)
* retryOnBlocked detects blocked webpage ([#1956](https://github.com/apify/crawlee/issues/1956)) ([766fa9b](https://github.com/apify/crawlee/commit/766fa9b88029e9243a7427075384c1abe85c70c8))





## [3.4.1](https://github.com/apify/crawlee/compare/v3.4.0...v3.4.1) (2023-07-13)


### Bug Fixes

* **http-crawler:** replace `IncomingMessage` with `PlainResponse` for context's `response` ([#1973](https://github.com/apify/crawlee/issues/1973)) ([2a1cc7f](https://github.com/apify/crawlee/commit/2a1cc7f4f87f0b1c657759076a236a8f8d9b76ba)), closes [#1964](https://github.com/apify/crawlee/issues/1964)


### Features

* **jsdom,linkedom:** Expose document to crawler router context ([#1950](https://github.com/apify/crawlee/issues/1950)) ([4536dc2](https://github.com/apify/crawlee/commit/4536dc2900ee6d0acb562583ed8fca183df28e39))





# [3.4.0](https://github.com/apify/crawlee/compare/v3.3.3...v3.4.0) (2023-06-12)


### Bug Fixes

* respect `<base>` when enqueuing ([#1936](https://github.com/apify/crawlee/issues/1936)) ([aeef572](https://github.com/apify/crawlee/commit/aeef57231c84671374ed0309b7b95fa9ce9a6e8b))
* stop lerna from overwriting the copy.ts results ([#1946](https://github.com/apify/crawlee/issues/1946)) ([69bed40](https://github.com/apify/crawlee/commit/69bed4033eb1550fe1d0c9713b70f9527bf1bb51))


### Features

* add LinkeDOMCrawler ([#1907](https://github.com/apify/crawlee/issues/1907)) ([1c69560](https://github.com/apify/crawlee/commit/1c69560fe7ef45097e6be1037b79a84eb9a06337)), closes [/github.com/apify/crawlee/pull/1890#issuecomment-1533271694](https://github.com//github.com/apify/crawlee/pull/1890/issues/issuecomment-1533271694)
* infiniteScroll has maxScrollHeight limit ([#1945](https://github.com/apify/crawlee/issues/1945)) ([44997bb](https://github.com/apify/crawlee/commit/44997bba5bbf33ddb7dbac2f3e26d4bee60d4f47))





## [3.3.3](https://github.com/apify/crawlee/compare/v3.3.2...v3.3.3) (2023-05-31)


### Bug Fixes

* **MemoryStorage:** handle EXDEV errors when purging storages ([#1932](https://github.com/apify/crawlee/issues/1932)) ([e656050](https://github.com/apify/crawlee/commit/e6560507243f5e2d0b126160616573f13e5998e1))
* set status message every 5 seconds and log it via debug level ([#1918](https://github.com/apify/crawlee/issues/1918)) ([32aede6](https://github.com/apify/crawlee/commit/32aede6bbaa25b402e6e9cee9d3aa44722b1cfd0))


### Features

* add support for `requestsFromUrl` to `RequestQueue` ([#1917](https://github.com/apify/crawlee/issues/1917)) ([7f2557c](https://github.com/apify/crawlee/commit/7f2557cdbbdee177db7c5970ae5a4881b7bc9b35))
* **core:** add `Request.maxRetries` to allow overriding the `maxRequestRetries` ([#1925](https://github.com/apify/crawlee/issues/1925)) ([c5592db](https://github.com/apify/crawlee/commit/c5592db0f8094de27c46ad993bea2c1ab1f61385))





## [3.3.2](https://github.com/apify/crawlee/compare/v3.3.1...v3.3.2) (2023-05-11)


### Bug Fixes

* **MemoryStorage:** cache requests in `RequestQueue` ([#1899](https://github.com/apify/crawlee/issues/1899)) ([063dcd1](https://github.com/apify/crawlee/commit/063dcd1c9e6652cd316cc0e8c4f4e4bbb70c246e))
* respect config object when creating `SessionPool` ([#1881](https://github.com/apify/crawlee/issues/1881)) ([db069df](https://github.com/apify/crawlee/commit/db069df80bc183c6b861c9ac82f1e278e57ea92b))


### Features

* allow running single crawler instance multiple times ([#1844](https://github.com/apify/crawlee/issues/1844)) ([9e6eb1e](https://github.com/apify/crawlee/commit/9e6eb1e32f582a8837311aac12cc1d657432f3fa)), closes [#765](https://github.com/apify/crawlee/issues/765)
* **HttpCrawler:** add `parseWithCheerio` helper to `HttpCrawler` ([#1906](https://github.com/apify/crawlee/issues/1906)) ([ff5f76f](https://github.com/apify/crawlee/commit/ff5f76f9336c47c555c28038cdc72dc650bb5065))
* **router:** allow inline router definition ([#1877](https://github.com/apify/crawlee/issues/1877)) ([2d241c9](https://github.com/apify/crawlee/commit/2d241c9f88964ebd41a181069c378b6b7b5bf262))
* RQv2 memory storage support ([#1874](https://github.com/apify/crawlee/issues/1874)) ([049486b](https://github.com/apify/crawlee/commit/049486b772cc2accd2d2d226d8c8726e5ab933a9))
* support alternate storage clients when opening storages ([#1901](https://github.com/apify/crawlee/issues/1901)) ([661e550](https://github.com/apify/crawlee/commit/661e550dcf3609b75e2d7bc225c2f6914f45c93e))





## [3.3.1](https://github.com/apify/crawlee/compare/v3.3.0...v3.3.1) (2023-04-11)


### Bug Fixes

* infiniteScroll() not working in Firefox ([#1826](https://github.com/apify/crawlee/issues/1826)) ([4286c5d](https://github.com/apify/crawlee/commit/4286c5d29b94aec3f4d3835bbf36b7fafcaec8f0)), closes [#1821](https://github.com/apify/crawlee/issues/1821)
* **jsdom:** add timeout to the window.load wait when `runScripts` are enabled ([806de31](https://github.com/apify/crawlee/commit/806de31222e138ef2d8e2706536a7288423be3d4))
* **jsdom:** delay closing of the window and add some polyfills ([2e81618](https://github.com/apify/crawlee/commit/2e81618afb5f3890495e3e5fcfa037eb3319edc9))
* **jsdom:** use no-op `enqueueLinks` in http crawlers when parsing fails ([fd35270](https://github.com/apify/crawlee/commit/fd35270e7da67a77eb60108e19294f0fd2016706))
* **MemoryStorage:** handling of readable streams for key-value stores when setting records ([#1852](https://github.com/apify/crawlee/issues/1852)) ([a5ee37d](https://github.com/apify/crawlee/commit/a5ee37d7e245f004785fc03220e37aeafdfa0e81)), closes [#1843](https://github.com/apify/crawlee/issues/1843)
* start status message logger after the crawl actually starts ([5d1df7a](https://github.com/apify/crawlee/commit/5d1df7aae00d0d6ca29338723f92b77cff667354))
* status message - total requests ([#1842](https://github.com/apify/crawlee/issues/1842)) ([710f734](https://github.com/apify/crawlee/commit/710f7347623619057e99abf539f0ccf78de41bbc))
* **Storage:** queue up opening storages to prevent issues in concurrent calls ([#1865](https://github.com/apify/crawlee/issues/1865)) ([044c740](https://github.com/apify/crawlee/commit/044c740101dd0acd2248dee3702aec769ce0c892))
* **templates:** added missing '@types/node' peer dependency ([#1860](https://github.com/apify/crawlee/issues/1860)) ([d37a7e2](https://github.com/apify/crawlee/commit/d37a7e2a068809df877dfd239f2500bce788eaf4))
* try to detect stuck request queue and fix its state ([#1837](https://github.com/apify/crawlee/issues/1837)) ([95a9f94](https://github.com/apify/crawlee/commit/95a9f941836c020a3223fd309f11cff58bc50624))


### Features

* add `parseWithCheerio` context helper to cheerio crawler ([b336a73](https://github.com/apify/crawlee/commit/b336a739117a6e4180492ec9915ddce128376a2c))
* **jsdom:** add `parseWithCheerio` context helper ([c8f0796](https://github.com/apify/crawlee/commit/c8f0796aebc0dfa6e6d04740a0bb7d8ddd5b2d96))





# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)


### Bug Fixes

* add `proxyUrl` to `DownloadListOfUrlsOptions` ([779be1e](https://github.com/apify/crawlee/commit/779be1e4f29dff191d02e623eefb1bd5650c14ad)), closes [#1780](https://github.com/apify/crawlee/issues/1780)
* **CheerioCrawler:** pass ixXml down to response parser ([#1807](https://github.com/apify/crawlee/issues/1807)) ([af7a5c4](https://github.com/apify/crawlee/commit/af7a5c4efa94a53e5bdfeca340a9d7223d7dfda4)), closes [#1794](https://github.com/apify/crawlee/issues/1794)
* ignore invalid URLs in `enqueueLinks` in browser crawlers ([#1803](https://github.com/apify/crawlee/issues/1803)) ([5ac336c](https://github.com/apify/crawlee/commit/5ac336c5b83b212fd6281659b8ceee091e259ff1))
* **MemoryStorage:** request queues race conditions causing crashes ([#1806](https://github.com/apify/crawlee/issues/1806)) ([083a9db](https://github.com/apify/crawlee/commit/083a9db9ebcddd3fa886631234c790d4c5bcdf86)), closes [#1792](https://github.com/apify/crawlee/issues/1792)
* **MemoryStorage:** RequestQueue should respect `forefront` ([#1816](https://github.com/apify/crawlee/issues/1816)) ([b68e86a](https://github.com/apify/crawlee/commit/b68e86a97954bcbe30fde802fed5f263016fffe2)), closes [#1787](https://github.com/apify/crawlee/issues/1787)
* **MemoryStorage:** RequestQueue#handledRequestCount should update ([#1817](https://github.com/apify/crawlee/issues/1817)) ([a775e4a](https://github.com/apify/crawlee/commit/a775e4afea20d0b31492f44b90f61b6a903491b6)), closes [#1764](https://github.com/apify/crawlee/issues/1764)


### Features

* add basic support for `setStatusMessage` ([#1790](https://github.com/apify/crawlee/issues/1790)) ([c318980](https://github.com/apify/crawlee/commit/c318980ec11d211b1a5c9e6bdbe76198c5d895be))
* **core:** add `exclude` option to `enqueueLinks` ([#1786](https://github.com/apify/crawlee/issues/1786)) ([2e833dc](https://github.com/apify/crawlee/commit/2e833dc4b0b82bb6741aa683f3fcba05244427df)), closes [#1785](https://github.com/apify/crawlee/issues/1785)
* move the status message implementation to Crawlee, noop in storage ([#1808](https://github.com/apify/crawlee/issues/1808)) ([99c3fdc](https://github.com/apify/crawlee/commit/99c3fdc18030b7898e6b6d149d6d94fab7881f09))





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)


### Bug Fixes

* **MemoryStorage:** request queues saved in the wrong place ([#1779](https://github.com/apify/crawlee/issues/1779)) ([19409db](https://github.com/apify/crawlee/commit/19409dbd614560a73c97ef6e00997e482573d2ff))





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)


### Bug Fixes

* add `QueueOperationInfo` export to the core package ([5ec6c24](https://github.com/apify/crawlee/commit/5ec6c24ba31c11c0ff4db49a6461f112a70071b3))





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* allow `userData` option in `enqueueLinksByClickingElements` ([#1749](https://github.com/apify/crawlee/issues/1749)) ([736f85d](https://github.com/apify/crawlee/commit/736f85d4a3b99a06d0f99f91e33e71976a9458a3)), closes [#1617](https://github.com/apify/crawlee/issues/1617)
* clone `request.userData` when creating new request object ([#1728](https://github.com/apify/crawlee/issues/1728)) ([222ef59](https://github.com/apify/crawlee/commit/222ef59b646740ae46be011ea0bc3d11c51a553e)), closes [#1725](https://github.com/apify/crawlee/issues/1725)
* Correctly compute `pendingRequestCount` in request queue ([#1765](https://github.com/apify/crawlee/issues/1765)) ([946535f](https://github.com/apify/crawlee/commit/946535f2338086e13c71ff70129e7a1f6bfd275d)), closes [/github.com/apify/crawlee/blob/master/packages/memory-storage/src/resource-clients/request-queue.ts#L291-L298](https://github.com//github.com/apify/crawlee/blob/master/packages/memory-storage/src/resource-clients/request-queue.ts/issues/L291-L298)
* declare missing dependency on `tslib` ([27e96c8](https://github.com/apify/crawlee/commit/27e96c80c26e7fc31809a4b518d699573cb8c662)), closes [#1747](https://github.com/apify/crawlee/issues/1747)
* ensure CrawlingContext interface is inferred correctly in route handlers ([aa84633](https://github.com/apify/crawlee/commit/aa84633b1a2007c2e91bf012e944433b21243f2e))
* **KeyValueStore:** big buffers should not crash ([#1734](https://github.com/apify/crawlee/issues/1734)) ([2f682f7](https://github.com/apify/crawlee/commit/2f682f7ddd189cad11a3f5e7655ac6243444ff74)), closes [#1732](https://github.com/apify/crawlee/issues/1732) [#1710](https://github.com/apify/crawlee/issues/1710)
* **memory-storage:** dont fail when storage already purged ([#1737](https://github.com/apify/crawlee/issues/1737)) ([8694027](https://github.com/apify/crawlee/commit/86940273dbac2d13294140962f816f66582684ff)), closes [#1736](https://github.com/apify/crawlee/issues/1736)
* update playwright to 1.29.2 and make peer dep. less strict ([#1735](https://github.com/apify/crawlee/issues/1735)) ([c654fcd](https://github.com/apify/crawlee/commit/c654fcdea06fb203b7952ed97650190cc0e74394)), closes [#1723](https://github.com/apify/crawlee/issues/1723)
* **utils:** add missing dependency on `ow` ([bf0e03c](https://github.com/apify/crawlee/commit/bf0e03cc6ddc103c9337de5cd8dce9bc86c369a3)), closes [#1716](https://github.com/apify/crawlee/issues/1716)


### Features

* add `forefront` option to all `enqueueLinks` variants ([#1760](https://github.com/apify/crawlee/issues/1760)) ([a01459d](https://github.com/apify/crawlee/commit/a01459dffb51162e676354f0aa4811a1d36affa9)), closes [#1483](https://github.com/apify/crawlee/issues/1483)
* **enqueueLinks:** add SameOrigin strategy and relax protocol matching for the other strategies ([#1748](https://github.com/apify/crawlee/issues/1748)) ([4ba982a](https://github.com/apify/crawlee/commit/4ba982a909a3c16004b24ef90c3da3ee4e075be0))
* **MemoryStorage:** read from fs if persistStorage is enabled, ram only otherwise ([#1761](https://github.com/apify/crawlee/issues/1761)) ([e903980](https://github.com/apify/crawlee/commit/e9039809a0c0af0bc086be1f1400d18aa45ae490))





## [3.1.4](https://github.com/apify/crawlee/compare/v3.1.3...v3.1.4) (2022-12-14)


### Bug Fixes

* session.markBad() on requestHandler error ([#1709](https://github.com/apify/crawlee/issues/1709)) ([e87eb1f](https://github.com/apify/crawlee/commit/e87eb1f2ccd9585f8d53cb03ec671cedf23a06b4)), closes [#1635](https://github.com/apify/crawlee/issues/1635) [/github.com/apify/crawlee/blob/5ff04faa85c3a6b6f02cd58a91b46b80610d8ae6/packages/browser-crawler/src/internals/browser-crawler.ts#L524](https://github.com//github.com/apify/crawlee/blob/5ff04faa85c3a6b6f02cd58a91b46b80610d8ae6/packages/browser-crawler/src/internals/browser-crawler.ts/issues/L524)





## [3.1.3](https://github.com/apify/crawlee/compare/v3.1.2...v3.1.3) (2022-12-07)


### Bug Fixes

* remove memory leaks from migration event handling ([#1679](https://github.com/apify/crawlee/issues/1679)) ([49bba25](https://github.com/apify/crawlee/commit/49bba252ebc348b61eac3895155361f7d394db36)), closes [#1670](https://github.com/apify/crawlee/issues/1670)


### Features

* always show error origin if inside the userland ([#1677](https://github.com/apify/crawlee/issues/1677)) ([bbe9045](https://github.com/apify/crawlee/commit/bbe9045d550f95138d570522f6f469eae2d146d0))
* hideInternalConsole in JSDOMCrawler ([#1707](https://github.com/apify/crawlee/issues/1707)) ([8975f90](https://github.com/apify/crawlee/commit/8975f9088cf4dd38629c21e21061616fc1e7b003))





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

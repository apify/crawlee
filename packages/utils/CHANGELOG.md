# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.15.1](https://github.com/apify/crawlee/compare/v3.15.0...v3.15.1) (2025-09-26)

**Note:** Version bump only for package @crawlee/utils





# [3.15.0](https://github.com/apify/crawlee/compare/v3.14.1...v3.15.0) (2025-09-17)

**Note:** Version bump only for package @crawlee/utils





## [3.14.1](https://github.com/apify/crawlee/compare/v3.14.0...v3.14.1) (2025-08-05)

**Note:** Version bump only for package @crawlee/utils





# [3.14.0](https://github.com/apify/crawlee/compare/v3.13.10...v3.14.0) (2025-07-25)


### Bug Fixes

* validation of iterables when adding requests to the queue ([#3091](https://github.com/apify/crawlee/issues/3091)) ([529a1dd](https://github.com/apify/crawlee/commit/529a1dd57278efef4fb2013e79a09fd1bc8594a5)), closes [#3063](https://github.com/apify/crawlee/issues/3063)





## [3.13.10](https://github.com/apify/crawlee/compare/v3.13.9...v3.13.10) (2025-07-09)

**Note:** Version bump only for package @crawlee/utils





## [3.13.9](https://github.com/apify/crawlee/compare/v3.13.8...v3.13.9) (2025-06-27)


### Bug Fixes

* Do not log 'malformed sitemap content' on network errors in `Sitemap.tryCommonNames` ([#3015](https://github.com/apify/crawlee/issues/3015)) ([64a090f](https://github.com/apify/crawlee/commit/64a090ffbba5c69730ec0616e415a1eadf4bc7b3)), closes [#2884](https://github.com/apify/crawlee/issues/2884)


### Features

* Accept (Async)Iterables in `addRequests` methods ([#3013](https://github.com/apify/crawlee/issues/3013)) ([a4ab748](https://github.com/apify/crawlee/commit/a4ab74852c3c60bdbc96035f54b16d125220f699)), closes [#2980](https://github.com/apify/crawlee/issues/2980)





## [3.13.8](https://github.com/apify/crawlee/compare/v3.13.7...v3.13.8) (2025-06-16)


### Bug Fixes

* Persist rendering type detection results in `AdaptivePlaywrightCrawler` ([#2987](https://github.com/apify/crawlee/issues/2987)) ([76431ba](https://github.com/apify/crawlee/commit/76431badf8a55892303d9b53fe23e029fad9cb18)), closes [#2899](https://github.com/apify/crawlee/issues/2899)





## [3.13.7](https://github.com/apify/crawlee/compare/v3.13.6...v3.13.7) (2025-06-06)

**Note:** Version bump only for package @crawlee/utils





## [3.13.6](https://github.com/apify/crawlee/compare/v3.13.5...v3.13.6) (2025-06-05)

**Note:** Version bump only for package @crawlee/utils





## [3.13.5](https://github.com/apify/crawlee/compare/v3.13.4...v3.13.5) (2025-05-20)

**Note:** Version bump only for package @crawlee/utils





## [3.13.4](https://github.com/apify/crawlee/compare/v3.13.3...v3.13.4) (2025-05-14)


### Bug Fixes

* **social:** extract emails from each text node separately ([#2952](https://github.com/apify/crawlee/issues/2952)) ([799afc1](https://github.com/apify/crawlee/commit/799afc1dbb6843efa9d585823674ea75b9b352ea))





## [3.13.3](https://github.com/apify/crawlee/compare/v3.13.2...v3.13.3) (2025-05-05)

**Note:** Version bump only for package @crawlee/utils





## [3.13.2](https://github.com/apify/crawlee/compare/v3.13.1...v3.13.2) (2025-04-08)

**Note:** Version bump only for package @crawlee/utils





## [3.13.1](https://github.com/apify/crawlee/compare/v3.13.0...v3.13.1) (2025-04-07)


### Bug Fixes

* rename `RobotsFile` to `RobotsTxtFile` ([#2913](https://github.com/apify/crawlee/issues/2913)) ([3160f71](https://github.com/apify/crawlee/commit/3160f717e865326476d78089d778cbc7d35aa58d)), closes [#2910](https://github.com/apify/crawlee/issues/2910)


### Features

* add `respectRobotsTxtFile` crawler option ([#2910](https://github.com/apify/crawlee/issues/2910)) ([0eabed1](https://github.com/apify/crawlee/commit/0eabed1f13070d902c2c67b340621830a7f64464))





# [3.13.0](https://github.com/apify/crawlee/compare/v3.12.2...v3.13.0) (2025-03-04)


### Features

* improved cross platform metric collection ([#2834](https://github.com/apify/crawlee/issues/2834)) ([e41b2f7](https://github.com/apify/crawlee/commit/e41b2f744513dd80aa05336eedfa1c08c54d3832)), closes [#2771](https://github.com/apify/crawlee/issues/2771)





## [3.12.2](https://github.com/apify/crawlee/compare/v3.12.1...v3.12.2) (2025-01-27)

**Note:** Version bump only for package @crawlee/utils





## [3.12.1](https://github.com/apify/crawlee/compare/v3.12.0...v3.12.1) (2024-12-04)


### Bug Fixes

* **social:** support new URL formats for Facebook, YouTube and X ([#2758](https://github.com/apify/crawlee/issues/2758)) ([4c95847](https://github.com/apify/crawlee/commit/4c95847d5cedd6514620ccab31d5b242ba76de80)), closes [#525](https://github.com/apify/crawlee/issues/525)





# [3.12.0](https://github.com/apify/crawlee/compare/v3.11.5...v3.12.0) (2024-11-04)


### Bug Fixes

* `.trim()` urls from pretty-printed sitemap.xml files ([#2709](https://github.com/apify/crawlee/issues/2709)) ([802a6fe](https://github.com/apify/crawlee/commit/802a6fea7b2125e2b36d740fc2d5d131de5d53ed)), closes [#2698](https://github.com/apify/crawlee/issues/2698)


### Features

* allow using other HTTP clients ([#2661](https://github.com/apify/crawlee/issues/2661)) ([568c655](https://github.com/apify/crawlee/commit/568c6556d79ce91654c8a715d1d1729d7d6ed8ef)), closes [#2659](https://github.com/apify/crawlee/issues/2659)





## [3.11.5](https://github.com/apify/crawlee/compare/v3.11.4...v3.11.5) (2024-10-04)

**Note:** Version bump only for package @crawlee/utils





## [3.11.4](https://github.com/apify/crawlee/compare/v3.11.3...v3.11.4) (2024-09-23)


### Bug Fixes

* `SitemapRequestList.teardown()` doesn't break `persistState` calls ([#2673](https://github.com/apify/crawlee/issues/2673)) ([fb2c5cd](https://github.com/apify/crawlee/commit/fb2c5cdaa47e2d3a91ade726cfba3091917a0137)), closes [/github.com/apify/crawlee/blob/f3eb99d9fa9a7aa0ec1dcb9773e666a9ac14fb76/packages/core/src/storages/sitemap_request_list.ts#L446](https://github.com//github.com/apify/crawlee/blob/f3eb99d9fa9a7aa0ec1dcb9773e666a9ac14fb76/packages/core/src/storages/sitemap_request_list.ts/issues/L446) [#2672](https://github.com/apify/crawlee/issues/2672)





## [3.11.3](https://github.com/apify/crawlee/compare/v3.11.2...v3.11.3) (2024-09-03)


### Bug Fixes

* improve `FACEBOOK_REGEX` to match older style page URLs ([#2650](https://github.com/apify/crawlee/issues/2650)) ([a005e69](https://github.com/apify/crawlee/commit/a005e699682cbf4bb2e48ff92cf2bbf3e0d2be26)), closes [#2216](https://github.com/apify/crawlee/issues/2216)





## [3.11.2](https://github.com/apify/crawlee/compare/v3.11.1...v3.11.2) (2024-08-28)


### Bug Fixes

* use namespace imports for cheerio to be compatible with v1 ([#2641](https://github.com/apify/crawlee/issues/2641)) ([f48296f](https://github.com/apify/crawlee/commit/f48296f6cba7b81fe102d4b874505c27f93d9fc1))


### Features

* resilient sitemap loading ([#2619](https://github.com/apify/crawlee/issues/2619)) ([1dd7660](https://github.com/apify/crawlee/commit/1dd76601e03de4541964116b3a77376e233ea22b))





## [3.11.1](https://github.com/apify/crawlee/compare/v3.11.0...v3.11.1) (2024-07-24)


### Bug Fixes

* use `getHTML` in the shadow root expansion ([#2587](https://github.com/apify/crawlee/issues/2587)) ([a244d62](https://github.com/apify/crawlee/commit/a244d62cca03d628677eca8a5adcf41e33c51dee)), closes [#2583](https://github.com/apify/crawlee/issues/2583)





# [3.11.0](https://github.com/apify/crawlee/compare/v3.10.5...v3.11.0) (2024-07-09)


### Features

* Sitemap-based request list implementation ([#2498](https://github.com/apify/crawlee/issues/2498)) ([7bf8f0b](https://github.com/apify/crawlee/commit/7bf8f0bcd4cc81e02c7cc60e82dfe7a0cdd80938))





## [3.10.5](https://github.com/apify/crawlee/compare/v3.10.4...v3.10.5) (2024-06-12)

**Note:** Version bump only for package @crawlee/utils





## [3.10.4](https://github.com/apify/crawlee/compare/v3.10.3...v3.10.4) (2024-06-11)

**Note:** Version bump only for package @crawlee/utils





## [3.10.3](https://github.com/apify/crawlee/compare/v3.10.2...v3.10.3) (2024-06-07)


### Bug Fixes

* respect implicit router when no `requestHandler` is provided in `AdaptiveCrawler` ([#2518](https://github.com/apify/crawlee/issues/2518)) ([31083aa](https://github.com/apify/crawlee/commit/31083aa27ddd51827f73c7ac4290379ec7a81283))





## [3.10.2](https://github.com/apify/crawlee/compare/v3.10.1...v3.10.2) (2024-06-03)


### Bug Fixes

* Autodetect sitemap filetype from content ([#2497](https://github.com/apify/crawlee/issues/2497)) ([62a9f40](https://github.com/apify/crawlee/commit/62a9f4036dba92d07547af489ac8b6c7974faa6f)), closes [#2461](https://github.com/apify/crawlee/issues/2461)


### Features

* Loading sitemaps from string ([#2496](https://github.com/apify/crawlee/issues/2496)) ([38ed0d6](https://github.com/apify/crawlee/commit/38ed0d6ad90a868df9c02632334fec8db9ef29a0)), closes [#2460](https://github.com/apify/crawlee/issues/2460)





## [3.10.1](https://github.com/apify/crawlee/compare/v3.10.0...v3.10.1) (2024-05-23)


### Bug Fixes

* adjust `URL_NO_COMMAS_REGEX` regexp to allow single character hostnames ([#2492](https://github.com/apify/crawlee/issues/2492)) ([ec802e8](https://github.com/apify/crawlee/commit/ec802e85f54022616e5bdcc1a6fd1bd43e1b3ace)), closes [#2487](https://github.com/apify/crawlee/issues/2487)





# [3.10.0](https://github.com/apify/crawlee/compare/v3.9.2...v3.10.0) (2024-05-16)


### Bug Fixes

* malformed sitemap url when sitemap index child contains querystring ([#2430](https://github.com/apify/crawlee/issues/2430)) ([e4cd41c](https://github.com/apify/crawlee/commit/e4cd41c49999af270fbe2476a61d92c8e3502463))
* return true when robots.isAllowed returns undefined ([#2439](https://github.com/apify/crawlee/issues/2439)) ([6f541f8](https://github.com/apify/crawlee/commit/6f541f8c4ea9b1e94eb506383019397676fd79fe)), closes [#2437](https://github.com/apify/crawlee/issues/2437)
* sitemap `content-type` check breaks on `content-type` parameters ([#2442](https://github.com/apify/crawlee/issues/2442)) ([db7d372](https://github.com/apify/crawlee/commit/db7d37256a49820e3e584165fff42377042ec258))


### Features

* implement ErrorSnapshotter for error context capture ([#2332](https://github.com/apify/crawlee/issues/2332)) ([e861dfd](https://github.com/apify/crawlee/commit/e861dfdb451ae32fb1e0c7749c6b59744654b303)), closes [#2280](https://github.com/apify/crawlee/issues/2280)





## [3.9.2](https://github.com/apify/crawlee/compare/v3.9.1...v3.9.2) (2024-04-17)


### Features

* **sitemap:** Support CDATA in sitemaps ([#2424](https://github.com/apify/crawlee/issues/2424)) ([635f046](https://github.com/apify/crawlee/commit/635f046b7933e0ad1b0ee627a22a9adaf21847d3))





## [3.9.1](https://github.com/apify/crawlee/compare/v3.9.0...v3.9.1) (2024-04-11)

**Note:** Version bump only for package @crawlee/utils





# [3.9.0](https://github.com/apify/crawlee/compare/v3.8.2...v3.9.0) (2024-04-10)


### Bug Fixes

* sitemaps support `application/xml` ([#2408](https://github.com/apify/crawlee/issues/2408)) ([cbcf47a](https://github.com/apify/crawlee/commit/cbcf47a7b991a8b88a6c2a46f3684444d776fcdd))


### Features

* expand #shadow-root elements automatically in `parseWithCheerio` helper ([#2396](https://github.com/apify/crawlee/issues/2396)) ([a05b3a9](https://github.com/apify/crawlee/commit/a05b3a93a9b57926b353df0e79d846b5024c42ac))





## [3.8.2](https://github.com/apify/crawlee/compare/v3.8.1...v3.8.2) (2024-03-21)


### Bug Fixes

* correctly report gzip decompression errors ([#2368](https://github.com/apify/crawlee/issues/2368)) ([84a2f17](https://github.com/apify/crawlee/commit/84a2f1733033bf247b2cede3f1728e75bf2c8ff9))





## [3.8.1](https://github.com/apify/crawlee/compare/v3.8.0...v3.8.1) (2024-02-22)

**Note:** Version bump only for package @crawlee/utils





# [3.8.0](https://github.com/apify/crawlee/compare/v3.7.3...v3.8.0) (2024-02-21)


### Features

* add Sitemap.tryCommonNames to check well known sitemap locations ([#2311](https://github.com/apify/crawlee/issues/2311)) ([85589f1](https://github.com/apify/crawlee/commit/85589f167196ac49c0cc10664ab3e9e5595208ed)), closes [#2307](https://github.com/apify/crawlee/issues/2307)
* **core:** add `userAgent` parameter to `RobotsFile.isAllowed()` + `RobotsFile.from()` helper ([#2338](https://github.com/apify/crawlee/issues/2338)) ([343c159](https://github.com/apify/crawlee/commit/343c159f20546a2006db33da4674e6ffd77db572))
* Support plain-text sitemap files (sitemap.txt) ([#2315](https://github.com/apify/crawlee/issues/2315)) ([0bee7da](https://github.com/apify/crawlee/commit/0bee7daf9509fe61c8d83799e706f0bb030257ec))





## [3.7.3](https://github.com/apify/crawlee/compare/v3.7.2...v3.7.3) (2024-01-30)


### Bug Fixes

* pass on an invisible CF turnstile ([#2277](https://github.com/apify/crawlee/issues/2277)) ([d8734e7](https://github.com/apify/crawlee/commit/d8734e765238115d9cba6dda9c649ad8573890d8)), closes [#2256](https://github.com/apify/crawlee/issues/2256)





## [3.7.2](https://github.com/apify/crawlee/compare/v3.7.1...v3.7.2) (2024-01-09)

**Note:** Version bump only for package @crawlee/utils





## [3.7.1](https://github.com/apify/crawlee/compare/v3.7.0...v3.7.1) (2024-01-02)


### Bug Fixes

* ES2022 build compatibility and move to NodeNext for module ([#2258](https://github.com/apify/crawlee/issues/2258)) ([7fe1e68](https://github.com/apify/crawlee/commit/7fe1e685904660c8446aafdf739fd1212684b48c)), closes [#2257](https://github.com/apify/crawlee/issues/2257)





# [3.7.0](https://github.com/apify/crawlee/compare/v3.6.2...v3.7.0) (2023-12-21)


### Bug Fixes

* `retryOnBlocked` doesn't override the blocked HTTP codes ([#2243](https://github.com/apify/crawlee/issues/2243)) ([81672c3](https://github.com/apify/crawlee/commit/81672c3d1db1dcdcffb868de5740addff82cf112))


### Features

* robots.txt and sitemap.xml utils ([#2214](https://github.com/apify/crawlee/issues/2214)) ([fdfec4f](https://github.com/apify/crawlee/commit/fdfec4f4d0a0f925b49015d2d63932c4a82555ba)), closes [#2187](https://github.com/apify/crawlee/issues/2187)





## [3.6.2](https://github.com/apify/crawlee/compare/v3.6.1...v3.6.2) (2023-11-26)

**Note:** Version bump only for package @crawlee/utils





## [3.6.1](https://github.com/apify/crawlee/compare/v3.6.0...v3.6.1) (2023-11-15)

**Note:** Version bump only for package @crawlee/utils





# [3.6.0](https://github.com/apify/crawlee/compare/v3.5.8...v3.6.0) (2023-11-15)


### Features

* got-scraping v4 ([#2110](https://github.com/apify/crawlee/issues/2110)) ([2f05ed2](https://github.com/apify/crawlee/commit/2f05ed22b203f688095300400bb0e6d03a03283c))





## [3.5.8](https://github.com/apify/crawlee/compare/v3.5.7...v3.5.8) (2023-10-17)


### Bug Fixes

* refactor `extractUrls` to split the text line by line first ([#2122](https://github.com/apify/crawlee/issues/2122)) ([7265cd7](https://github.com/apify/crawlee/commit/7265cd7148bb4889d60434d671f153387fb5a4dd))





## [3.5.7](https://github.com/apify/crawlee/compare/v3.5.6...v3.5.7) (2023-10-05)

**Note:** Version bump only for package @crawlee/utils





## [3.5.6](https://github.com/apify/crawlee/compare/v3.5.5...v3.5.6) (2023-10-04)


### Features

* add incapsula iframe selector to the blocked list ([#2111](https://github.com/apify/crawlee/issues/2111)) ([2b17d8a](https://github.com/apify/crawlee/commit/2b17d8a797dec2824a0063792aa7bd3fce8dccae)), closes [apify/store-website-content-crawler#154](https://github.com/apify/store-website-content-crawler/issues/154)





## [3.5.5](https://github.com/apify/crawlee/compare/v3.5.4...v3.5.5) (2023-10-02)

**Note:** Version bump only for package @crawlee/utils





## [3.5.4](https://github.com/apify/crawlee/compare/v3.5.3...v3.5.4) (2023-09-11)

**Note:** Version bump only for package @crawlee/utils





## [3.5.3](https://github.com/apify/crawlee/compare/v3.5.2...v3.5.3) (2023-08-31)


### Bug Fixes

* pin all internal dependencies ([#2041](https://github.com/apify/crawlee/issues/2041)) ([d6f2b17](https://github.com/apify/crawlee/commit/d6f2b172d4a6776137c7893ca798d5b4a9408e79)), closes [#2040](https://github.com/apify/crawlee/issues/2040)





## [3.5.2](https://github.com/apify/crawlee/compare/v3.5.1...v3.5.2) (2023-08-21)

**Note:** Version bump only for package @crawlee/utils





## [3.5.1](https://github.com/apify/crawlee/compare/v3.5.0...v3.5.1) (2023-08-16)

**Note:** Version bump only for package @crawlee/utils





# [3.5.0](https://github.com/apify/crawlee/compare/v3.4.2...v3.5.0) (2023-07-31)


### Features

* retire session on proxy error ([#2002](https://github.com/apify/crawlee/issues/2002)) ([8c0928b](https://github.com/apify/crawlee/commit/8c0928b24ceabefc454f8114ac30a27023709010)), closes [#1912](https://github.com/apify/crawlee/issues/1912)





## [3.4.2](https://github.com/apify/crawlee/compare/v3.4.1...v3.4.2) (2023-07-19)


### Features

* retryOnBlocked detects blocked webpage ([#1956](https://github.com/apify/crawlee/issues/1956)) ([766fa9b](https://github.com/apify/crawlee/commit/766fa9b88029e9243a7427075384c1abe85c70c8))





## [3.4.1](https://github.com/apify/crawlee/compare/v3.4.0...v3.4.1) (2023-07-13)

**Note:** Version bump only for package @crawlee/utils





# [3.4.0](https://github.com/apify/crawlee/compare/v3.3.3...v3.4.0) (2023-06-12)

**Note:** Version bump only for package @crawlee/utils





## [3.3.3](https://github.com/apify/crawlee/compare/v3.3.2...v3.3.3) (2023-05-31)

**Note:** Version bump only for package @crawlee/utils





## [3.3.2](https://github.com/apify/crawlee/compare/v3.3.1...v3.3.2) (2023-05-11)

**Note:** Version bump only for package @crawlee/utils





## [3.3.1](https://github.com/apify/crawlee/compare/v3.3.0...v3.3.1) (2023-04-11)


### Bug Fixes

* **jsdom:** delay closing of the window and add some polyfills ([2e81618](https://github.com/apify/crawlee/commit/2e81618afb5f3890495e3e5fcfa037eb3319edc9))





# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)


### Bug Fixes

* add `proxyUrl` to `DownloadListOfUrlsOptions` ([779be1e](https://github.com/apify/crawlee/commit/779be1e4f29dff191d02e623eefb1bd5650c14ad)), closes [#1780](https://github.com/apify/crawlee/issues/1780)





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)

**Note:** Version bump only for package @crawlee/utils





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)

**Note:** Version bump only for package @crawlee/utils





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* **utils:** add missing dependency on `ow` ([bf0e03c](https://github.com/apify/crawlee/commit/bf0e03cc6ddc103c9337de5cd8dce9bc86c369a3)), closes [#1716](https://github.com/apify/crawlee/issues/1716)





## 3.1.2 (2022-11-15)

**Note:** Version bump only for package @crawlee/utils





## 3.1.1 (2022-11-07)

**Note:** Version bump only for package @crawlee/utils





# 3.1.0 (2022-10-13)

**Note:** Version bump only for package @crawlee/utils





## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)

**Note:** Version bump only for package @crawlee/utils

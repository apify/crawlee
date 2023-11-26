# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.6.2](https://github.com/apify/crawlee/compare/v3.6.1...v3.6.2) (2023-11-26)

**Note:** Version bump only for package @crawlee/playwright





## [3.6.1](https://github.com/apify/crawlee/compare/v3.6.0...v3.6.1) (2023-11-15)


### Features

* **puppeteer:** enable `new` headless mode ([#1910](https://github.com/apify/crawlee/issues/1910)) ([7fc999c](https://github.com/apify/crawlee/commit/7fc999cf4658ca69b97f16d434444081998470f4))





# [3.6.0](https://github.com/apify/crawlee/compare/v3.5.8...v3.6.0) (2023-11-15)


### Bug Fixes

* add `skipNavigation` option to `enqueueLinks` ([#2153](https://github.com/apify/crawlee/issues/2153)) ([118515d](https://github.com/apify/crawlee/commit/118515d2ba534b99be2f23436f6abe41d66a8e07))





## [3.5.8](https://github.com/apify/crawlee/compare/v3.5.7...v3.5.8) (2023-10-17)

**Note:** Version bump only for package @crawlee/playwright





## [3.5.7](https://github.com/apify/crawlee/compare/v3.5.6...v3.5.7) (2023-10-05)

**Note:** Version bump only for package @crawlee/playwright





## [3.5.6](https://github.com/apify/crawlee/compare/v3.5.5...v3.5.6) (2023-10-04)

**Note:** Version bump only for package @crawlee/playwright





## [3.5.5](https://github.com/apify/crawlee/compare/v3.5.4...v3.5.5) (2023-10-02)


### Bug Fixes

* allow to use any version of puppeteer or playwright ([#2102](https://github.com/apify/crawlee/issues/2102)) ([0cafceb](https://github.com/apify/crawlee/commit/0cafceb2966d430dd1b2a1b619fe66da1c951f4c)), closes [#2101](https://github.com/apify/crawlee/issues/2101)


### Features

* Request Queue v2 ([#1975](https://github.com/apify/crawlee/issues/1975)) ([70a77ee](https://github.com/apify/crawlee/commit/70a77ee15f984e9ae67cd584fc58ace7e55346db)), closes [#1365](https://github.com/apify/crawlee/issues/1365)





## [3.5.4](https://github.com/apify/crawlee/compare/v3.5.3...v3.5.4) (2023-09-11)


### Bug Fixes

* various helpers opening KVS now respect Configuration ([#2071](https://github.com/apify/crawlee/issues/2071)) ([59dbb16](https://github.com/apify/crawlee/commit/59dbb164699774e5a6718e98d0a4e8f630f35323))





## [3.5.3](https://github.com/apify/crawlee/compare/v3.5.2...v3.5.3) (2023-08-31)


### Bug Fixes

* pin all internal dependencies ([#2041](https://github.com/apify/crawlee/issues/2041)) ([d6f2b17](https://github.com/apify/crawlee/commit/d6f2b172d4a6776137c7893ca798d5b4a9408e79)), closes [#2040](https://github.com/apify/crawlee/issues/2040)





## [3.5.2](https://github.com/apify/crawlee/compare/v3.5.1...v3.5.2) (2023-08-21)

**Note:** Version bump only for package @crawlee/playwright





## [3.5.1](https://github.com/apify/crawlee/compare/v3.5.0...v3.5.1) (2023-08-16)

**Note:** Version bump only for package @crawlee/playwright





# [3.5.0](https://github.com/apify/crawlee/compare/v3.4.2...v3.5.0) (2023-07-31)


### Features

* add `closeCookieModals` context helper for Playwright and Puppeteer ([#1927](https://github.com/apify/crawlee/issues/1927)) ([98d93bb](https://github.com/apify/crawlee/commit/98d93bb6713ec219baa83db2ad2cd1d7621a3339))
* **core:** use `RequestQueue.addBatchedRequests()` in `enqueueLinks` helper ([4d61ca9](https://github.com/apify/crawlee/commit/4d61ca934072f8bbb680c842d8b1c9a4452ee73a)), closes [#1995](https://github.com/apify/crawlee/issues/1995)





## [3.4.2](https://github.com/apify/crawlee/compare/v3.4.1...v3.4.2) (2023-07-19)

**Note:** Version bump only for package @crawlee/playwright





## [3.4.1](https://github.com/apify/crawlee/compare/v3.4.0...v3.4.1) (2023-07-13)

**Note:** Version bump only for package @crawlee/playwright





# [3.4.0](https://github.com/apify/crawlee/compare/v3.3.3...v3.4.0) (2023-06-12)


### Features

* infiniteScroll has maxScrollHeight limit ([#1945](https://github.com/apify/crawlee/issues/1945)) ([44997bb](https://github.com/apify/crawlee/commit/44997bba5bbf33ddb7dbac2f3e26d4bee60d4f47))





## [3.3.3](https://github.com/apify/crawlee/compare/v3.3.2...v3.3.3) (2023-05-31)

**Note:** Version bump only for package @crawlee/playwright





## [3.3.2](https://github.com/apify/crawlee/compare/v3.3.1...v3.3.2) (2023-05-11)


### Features

* **router:** allow inline router definition ([#1877](https://github.com/apify/crawlee/issues/1877)) ([2d241c9](https://github.com/apify/crawlee/commit/2d241c9f88964ebd41a181069c378b6b7b5bf262))





## [3.3.1](https://github.com/apify/crawlee/compare/v3.3.0...v3.3.1) (2023-04-11)


### Bug Fixes

* infiniteScroll() not working in Firefox ([#1826](https://github.com/apify/crawlee/issues/1826)) ([4286c5d](https://github.com/apify/crawlee/commit/4286c5d29b94aec3f4d3835bbf36b7fafcaec8f0)), closes [#1821](https://github.com/apify/crawlee/issues/1821)
* **jsdom:** delay closing of the window and add some polyfills ([2e81618](https://github.com/apify/crawlee/commit/2e81618afb5f3890495e3e5fcfa037eb3319edc9))





# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)

**Note:** Version bump only for package @crawlee/playwright





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)

**Note:** Version bump only for package @crawlee/playwright





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)

**Note:** Version bump only for package @crawlee/playwright





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* allow `userData` option in `enqueueLinksByClickingElements` ([#1749](https://github.com/apify/crawlee/issues/1749)) ([736f85d](https://github.com/apify/crawlee/commit/736f85d4a3b99a06d0f99f91e33e71976a9458a3)), closes [#1617](https://github.com/apify/crawlee/issues/1617)
* declare missing dependency on `tslib` ([27e96c8](https://github.com/apify/crawlee/commit/27e96c80c26e7fc31809a4b518d699573cb8c662)), closes [#1747](https://github.com/apify/crawlee/issues/1747)
* update playwright to 1.29.2 and make peer dep. less strict ([#1735](https://github.com/apify/crawlee/issues/1735)) ([c654fcd](https://github.com/apify/crawlee/commit/c654fcdea06fb203b7952ed97650190cc0e74394)), closes [#1723](https://github.com/apify/crawlee/issues/1723)


### Features

* add `forefront` option to all `enqueueLinks` variants ([#1760](https://github.com/apify/crawlee/issues/1760)) ([a01459d](https://github.com/apify/crawlee/commit/a01459dffb51162e676354f0aa4811a1d36affa9)), closes [#1483](https://github.com/apify/crawlee/issues/1483)





## [3.1.4](https://github.com/apify/crawlee/compare/v3.1.3...v3.1.4) (2022-12-14)

**Note:** Version bump only for package @crawlee/playwright





## [3.1.3](https://github.com/apify/crawlee/compare/v3.1.2...v3.1.3) (2022-12-07)

**Note:** Version bump only for package @crawlee/playwright





## 3.1.2 (2022-11-15)

**Note:** Version bump only for package @crawlee/playwright





## 3.1.1 (2022-11-07)

**Note:** Version bump only for package @crawlee/playwright





# 3.1.0 (2022-10-13)

**Note:** Version bump only for package @crawlee/playwright





## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)


### Features

* enable tab-as-a-container for Firefox ([#1456](https://github.com/apify/crawlee/issues/1456)) ([ae5ba4f](https://github.com/apify/crawlee/commit/ae5ba4f15fd6d14f444486234753ce1781c74cc8))

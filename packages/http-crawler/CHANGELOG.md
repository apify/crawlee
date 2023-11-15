# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.6.1](https://github.com/apify/crawlee/compare/v3.6.0...v3.6.1) (2023-11-15)

**Note:** Version bump only for package @crawlee/http





# [3.6.0](https://github.com/apify/crawlee/compare/v3.5.8...v3.6.0) (2023-11-15)


### Bug Fixes

* retry incorrect Content-Type when response has blocked status code ([#2176](https://github.com/apify/crawlee/issues/2176)) ([b54fb8b](https://github.com/apify/crawlee/commit/b54fb8bb7bc3575195ee676d21e5feb8f898ef47)), closes [#1994](https://github.com/apify/crawlee/issues/1994)


### Features

* got-scraping v4 ([#2110](https://github.com/apify/crawlee/issues/2110)) ([2f05ed2](https://github.com/apify/crawlee/commit/2f05ed22b203f688095300400bb0e6d03a03283c))





## [3.5.8](https://github.com/apify/crawlee/compare/v3.5.7...v3.5.8) (2023-10-17)

**Note:** Version bump only for package @crawlee/http





## [3.5.7](https://github.com/apify/crawlee/compare/v3.5.6...v3.5.7) (2023-10-05)

**Note:** Version bump only for package @crawlee/http





## [3.5.6](https://github.com/apify/crawlee/compare/v3.5.5...v3.5.6) (2023-10-04)

**Note:** Version bump only for package @crawlee/http





## [3.5.5](https://github.com/apify/crawlee/compare/v3.5.4...v3.5.5) (2023-10-02)

**Note:** Version bump only for package @crawlee/http





## [3.5.4](https://github.com/apify/crawlee/compare/v3.5.3...v3.5.4) (2023-09-11)

**Note:** Version bump only for package @crawlee/http





## [3.5.3](https://github.com/apify/crawlee/compare/v3.5.2...v3.5.3) (2023-08-31)


### Bug Fixes

* pin all internal dependencies ([#2041](https://github.com/apify/crawlee/issues/2041)) ([d6f2b17](https://github.com/apify/crawlee/commit/d6f2b172d4a6776137c7893ca798d5b4a9408e79)), closes [#2040](https://github.com/apify/crawlee/issues/2040)





## [3.5.2](https://github.com/apify/crawlee/compare/v3.5.1...v3.5.2) (2023-08-21)


### Bug Fixes

* support `DELETE` requests in `HttpCrawler` ([#2039](https://github.com/apify/crawlee/issues/2039)) ([7ea5c41](https://github.com/apify/crawlee/commit/7ea5c4185b169ec933dcd8df2e85824a7e452913)), closes [#1658](https://github.com/apify/crawlee/issues/1658)


### Features

* Add options for custom HTTP error status codes ([#2035](https://github.com/apify/crawlee/issues/2035)) ([b50ef1a](https://github.com/apify/crawlee/commit/b50ef1ad51d6d7c7a71e7f40efdb2b1ef0f09291)), closes [#1711](https://github.com/apify/crawlee/issues/1711)





## [3.5.1](https://github.com/apify/crawlee/compare/v3.5.0...v3.5.1) (2023-08-16)


### Bug Fixes

* log original error message on session rotation ([#2022](https://github.com/apify/crawlee/issues/2022)) ([8a11ffb](https://github.com/apify/crawlee/commit/8a11ffbdaef6b2fe8603aac570c3038f84c2f203))





# [3.5.0](https://github.com/apify/crawlee/compare/v3.4.2...v3.5.0) (2023-07-31)


### Features

* retire session on proxy error ([#2002](https://github.com/apify/crawlee/issues/2002)) ([8c0928b](https://github.com/apify/crawlee/commit/8c0928b24ceabefc454f8114ac30a27023709010)), closes [#1912](https://github.com/apify/crawlee/issues/1912)





## [3.4.2](https://github.com/apify/crawlee/compare/v3.4.1...v3.4.2) (2023-07-19)


### Features

* retryOnBlocked detects blocked webpage ([#1956](https://github.com/apify/crawlee/issues/1956)) ([766fa9b](https://github.com/apify/crawlee/commit/766fa9b88029e9243a7427075384c1abe85c70c8))





## [3.4.1](https://github.com/apify/crawlee/compare/v3.4.0...v3.4.1) (2023-07-13)


### Bug Fixes

* **http-crawler:** replace `IncomingMessage` with `PlainResponse` for context's `response` ([#1973](https://github.com/apify/crawlee/issues/1973)) ([2a1cc7f](https://github.com/apify/crawlee/commit/2a1cc7f4f87f0b1c657759076a236a8f8d9b76ba)), closes [#1964](https://github.com/apify/crawlee/issues/1964)





# [3.4.0](https://github.com/apify/crawlee/compare/v3.3.3...v3.4.0) (2023-06-12)

**Note:** Version bump only for package @crawlee/http





## [3.3.3](https://github.com/apify/crawlee/compare/v3.3.2...v3.3.3) (2023-05-31)

**Note:** Version bump only for package @crawlee/http





## [3.3.2](https://github.com/apify/crawlee/compare/v3.3.1...v3.3.2) (2023-05-11)


### Features

* **HttpCrawler:** add `parseWithCheerio` helper to `HttpCrawler` ([#1906](https://github.com/apify/crawlee/issues/1906)) ([ff5f76f](https://github.com/apify/crawlee/commit/ff5f76f9336c47c555c28038cdc72dc650bb5065))
* **router:** allow inline router definition ([#1877](https://github.com/apify/crawlee/issues/1877)) ([2d241c9](https://github.com/apify/crawlee/commit/2d241c9f88964ebd41a181069c378b6b7b5bf262))





## [3.3.1](https://github.com/apify/crawlee/compare/v3.3.0...v3.3.1) (2023-04-11)


### Bug Fixes

* **jsdom:** use no-op `enqueueLinks` in http crawlers when parsing fails ([fd35270](https://github.com/apify/crawlee/commit/fd35270e7da67a77eb60108e19294f0fd2016706))





# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)

**Note:** Version bump only for package @crawlee/http





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)

**Note:** Version bump only for package @crawlee/http





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)

**Note:** Version bump only for package @crawlee/http





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* declare missing dependency on `tslib` ([27e96c8](https://github.com/apify/crawlee/commit/27e96c80c26e7fc31809a4b518d699573cb8c662)), closes [#1747](https://github.com/apify/crawlee/issues/1747)





## [3.1.4](https://github.com/apify/crawlee/compare/v3.1.3...v3.1.4) (2022-12-14)

**Note:** Version bump only for package @crawlee/http





## [3.1.3](https://github.com/apify/crawlee/compare/v3.1.2...v3.1.3) (2022-12-07)

**Note:** Version bump only for package @crawlee/http





## 3.1.2 (2022-11-15)

**Note:** Version bump only for package @crawlee/http





## 3.1.1 (2022-11-07)

**Note:** Version bump only for package @crawlee/http





# 3.1.0 (2022-10-13)

**Note:** Version bump only for package @crawlee/http





## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)

**Note:** Version bump only for package @crawlee/http

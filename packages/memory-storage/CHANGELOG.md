# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [3.3.0](https://github.com/apify/crawlee/compare/v3.2.2...v3.3.0) (2023-03-09)


### Bug Fixes

* **MemoryStorage:** request queues race conditions causing crashes ([#1806](https://github.com/apify/crawlee/issues/1806)) ([083a9db](https://github.com/apify/crawlee/commit/083a9db9ebcddd3fa886631234c790d4c5bcdf86)), closes [#1792](https://github.com/apify/crawlee/issues/1792)
* **MemoryStorage:** RequestQueue should respect `forefront` ([#1816](https://github.com/apify/crawlee/issues/1816)) ([b68e86a](https://github.com/apify/crawlee/commit/b68e86a97954bcbe30fde802fed5f263016fffe2)), closes [#1787](https://github.com/apify/crawlee/issues/1787)
* **MemoryStorage:** RequestQueue#handledRequestCount should update ([#1817](https://github.com/apify/crawlee/issues/1817)) ([a775e4a](https://github.com/apify/crawlee/commit/a775e4afea20d0b31492f44b90f61b6a903491b6)), closes [#1764](https://github.com/apify/crawlee/issues/1764)


### Features

* add basic support for `setStatusMessage` ([#1790](https://github.com/apify/crawlee/issues/1790)) ([c318980](https://github.com/apify/crawlee/commit/c318980ec11d211b1a5c9e6bdbe76198c5d895be))
* move the status message implementation to Crawlee, noop in storage ([#1808](https://github.com/apify/crawlee/issues/1808)) ([99c3fdc](https://github.com/apify/crawlee/commit/99c3fdc18030b7898e6b6d149d6d94fab7881f09))





## [3.2.2](https://github.com/apify/crawlee/compare/v3.2.1...v3.2.2) (2023-02-08)


### Bug Fixes

* **MemoryStorage:** request queues saved in the wrong place ([#1779](https://github.com/apify/crawlee/issues/1779)) ([19409db](https://github.com/apify/crawlee/commit/19409dbd614560a73c97ef6e00997e482573d2ff))





## [3.2.1](https://github.com/apify/crawlee/compare/v3.2.0...v3.2.1) (2023-02-07)

**Note:** Version bump only for package @crawlee/memory-storage





# [3.2.0](https://github.com/apify/crawlee/compare/v3.1.4...v3.2.0) (2023-02-07)


### Bug Fixes

* Correctly compute `pendingRequestCount` in request queue ([#1765](https://github.com/apify/crawlee/issues/1765)) ([946535f](https://github.com/apify/crawlee/commit/946535f2338086e13c71ff70129e7a1f6bfd275d)), closes [/github.com/apify/crawlee/blob/master/packages/memory-storage/src/resource-clients/request-queue.ts#L291-L298](https://github.com//github.com/apify/crawlee/blob/master/packages/memory-storage/src/resource-clients/request-queue.ts/issues/L291-L298)
* **KeyValueStore:** big buffers should not crash ([#1734](https://github.com/apify/crawlee/issues/1734)) ([2f682f7](https://github.com/apify/crawlee/commit/2f682f7ddd189cad11a3f5e7655ac6243444ff74)), closes [#1732](https://github.com/apify/crawlee/issues/1732) [#1710](https://github.com/apify/crawlee/issues/1710)
* **memory-storage:** dont fail when storage already purged ([#1737](https://github.com/apify/crawlee/issues/1737)) ([8694027](https://github.com/apify/crawlee/commit/86940273dbac2d13294140962f816f66582684ff)), closes [#1736](https://github.com/apify/crawlee/issues/1736)
* **utils:** add missing dependency on `ow` ([bf0e03c](https://github.com/apify/crawlee/commit/bf0e03cc6ddc103c9337de5cd8dce9bc86c369a3)), closes [#1716](https://github.com/apify/crawlee/issues/1716)


### Features

* **MemoryStorage:** read from fs if persistStorage is enabled, ram only otherwise ([#1761](https://github.com/apify/crawlee/issues/1761)) ([e903980](https://github.com/apify/crawlee/commit/e9039809a0c0af0bc086be1f1400d18aa45ae490))





## 3.1.2 (2022-11-15)

**Note:** Version bump only for package @crawlee/memory-storage





## 3.1.1 (2022-11-07)

**Note:** Version bump only for package @crawlee/memory-storage





# 3.1.0 (2022-10-13)

**Note:** Version bump only for package @crawlee/memory-storage





## [3.0.4](https://github.com/apify/crawlee/compare/v3.0.3...v3.0.4) (2022-08-22)


### Bug Fixes

* key value stores emitting an error when multiple write promises ran in parallel ([#1460](https://github.com/apify/crawlee/issues/1460)) ([f201cca](https://github.com/apify/crawlee/commit/f201cca4a99d1c8b3e87be0289d5b3b363048f09))

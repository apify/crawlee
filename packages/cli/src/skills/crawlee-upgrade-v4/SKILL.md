---
name: crawlee-upgrade-v4
description: Migrate a JavaScript or TypeScript Crawlee project from v3 to v4 while preserving crawl behavior and persistence.
---

# Upgrade Crawlee from v3 to v4

Inspect, plan, migrate and verify this project. These bundled references summarize the [v4 upgrade guide](https://github.com/apify/crawlee/blob/master/docs/upgrading/upgrading_v4/upgrading_v4.md).

## Inspect and plan

Inspect manifests, lockfiles, crawler code, tests, runtime versions, CI and Dockerfiles. Inventory `crawlee`, `@crawlee/*`, `apify`, `apify-*` and `@apify/*` across workspace dependency sections. Use the [package map](<{SKILL_ROOT}/references/packages.md>) to identify roles and compatible versions. Actor projects also move to `apify@4`; other Apify packages have independent version numbers.

Search for the triggers below and load only applicable references. Plan the changes around the project's crawler types, custom collaborators, storage persistence and queue reuse. Ask about behavior the code does not establish. If already on v4, address remaining migration gaps.

## Git

For a Git project, inspect the branch and working tree. Ask once for permission to create a migration branch and make incremental commits, unless both are already authorized. Wait for approval before those Git actions.

If approved, verify and commit each coherent step before continuing. Stage only migration changes; preserve existing edits and ask about overlaps. Do not push unless asked. If branching or commits are declined, continue the migration without them.

## Common changes

- Require Node.js 22.13+ and TypeScript 5.8+ for declaration checking. Native ESM still supports compatible CommonJS consumers through `require(esm)`; preserve the project's module format. Cheerio moves to stable v1; `CheerioCrawler` and `htmlToText` keep `htmlparser2` via `cheerio/slim`, while `parseWithCheerio` on other crawlers uses full cheerio with `parse5`. Check parsing-sensitive extraction.
- Rename `handleRequestFunction` / `handlePageFunction` to `requestHandler`, `handleRequestTimeoutSecs` to `requestHandlerTimeoutSecs`, `handleFailedRequestFunction` to `failedRequestHandler`, `persistCookiesPerSession` to `saveResponseCookies`, and `ignoreSslErrors` to `ignoreTlsErrors`.
- `Configuration` is immutable: property reads replace `get()`, constructor options replace `set()` and now override environment variables. Pass crawler configuration via its `configuration` option. Service access moves to `serviceLocator`.
- Navigation and handlers have separate timeouts; hooks share the navigation budget. HTTP hooks lose `gotOptions`; browser hooks use `context.gotoOptions`. Errors move to the second error-handler argument. Replace `context.crawler` with a closure or `extendContext`; the latter runs before `page`, `$`, `body` and `response` exist.
- HTTP responses use native `Response`. The default client changes to impit; the fetch fallback has no proxies or impersonation.
- Sessions are mandatory. Replace `sessionPoolOptions` with a `SessionPool` instance, nesting session settings under `sessionOptions`. Caller-supplied collaborators require caller-owned cleanup. Session errors consume `maxRequestRetries`; browser handler cookies now persist when `saveResponseCookies` is enabled.
- Later crawlers get separate default queues. Repeated `run()` calls retain handled requests, including failures. Preserve intended queue sharing and reruns explicitly.
- Request storage writes are transactional. Failures discard buffered writes, but `useState()` mutations and default queue additions remain immediate. Read the storage reference for commit errors, streams and cross-handler reads.
- `KeyValueStore.getInput()` moves to `Actor.getInput()` for Actor projects. Plain Crawlee purges input with the default KVS and treats bare filenames as literal keys. Check existing input files before migrating.
- `globs`, `regexps` and `pseudoUrls` become `include`, which intersects with `strategy`. The `same-hostname` default can silently exclude previously matched subdomains; preserve link scope explicitly.
- `crawler.stats` becomes `crawler.statistics`; successful-request `*Finished*` counters become `*Succeeded*`. Keep `crawlerFinishedAt` unchanged.

## Dockerfiles and installation

Update Node versions below 22.13 in all build/runtime stages, including ARG-selected and Apify/browser images. Preserve the image family and browser support. Use Node.js 24+ only if introducing `await using`; Node.js 22 supports explicit cleanup with `try`/`finally`.

Remove flags or configuration that skip optional dependencies from installs and pruning, including scripts and CI. Native HTTP and filesystem binaries require them. Preserve dev-dependency omission and frozen-lockfile behavior. Update compatible Crawlee dependencies together and refresh the lockfile. See [Docker and installation](<{SKILL_ROOT}/references/docker-and-installation.md>) for flags and container checks.

## Read when applicable

| Project usage or migration error | Reference |
| --- | --- |
| Crawlee and Apify dependency inventory, package roles and compatibility | [Package map](<{SKILL_ROOT}/references/packages.md>) |
| Dockerfiles, Node image tags, CI installs or skipped optional dependencies | [Docker and installation](<{SKILL_ROOT}/references/docker-and-installation.md>) |
| Configuration services, custom context, validation errors, `log` option | [Configuration and context](<{SKILL_ROOT}/references/configuration-and-context.md>) |
| `SessionPool`, `Session`, cookie helpers, proxy tiers, `createSessionFunction` | [Sessions and proxies](<{SKILL_ROOT}/references/sessions-and-proxies.md>) |
| Browser hooks, `browserPoolOptions`, `browserController`, predictor, Cloudflare, Stagehand | [Browser management](<{SKILL_ROOT}/references/browser-management.md>) |
| Native responses, `gotScraping`, `BaseHttpClient`, `FileDownload` | [HTTP clients and downloads](<{SKILL_ROOT}/references/http-clients-and-downloads.md>) |
| URL filters, enqueue results, queue reuse, request lists, custom managers, `Request`, robots.txt, skipping, throttling | [Requests and links](<{SKILL_ROOT}/references/requests-and-links.md>) |
| Storage writes, local input files, `getInput`, `MemoryStorage`, `StorageClient`, custom backends, `listItems` | [Storage](<{SKILL_ROOT}/references/storage.md>) |
| `statisticsOptions`, custom `Statistics`, persisted counters | [Statistics](<{SKILL_ROOT}/references/statistics.md>) |
| `autoscaledPoolOptions`, `crawler.autoscaledPool`, snapshotting or load signals | [Concurrency](<{SKILL_ROOT}/references/concurrency.md>) |
| Subclasses, protected overrides, private fields, explicit generics, `RecoverableState` | [Crawler internals](<{SKILL_ROOT}/references/crawler-internals.md>) |
| Missing imports, `@crawlee/core`, `@crawlee/utils`, `@crawlee/types`, JSDOM or LinkeDOM | [Imports and removed symbols](<{SKILL_ROOT}/references/imports-and-removed-symbols.md>) |

## Verify

Run the project's type check, relevant tests and build. Use fixtures or a bounded crawl with isolated storage to check affected behavior. Do not purge user storage or run a production crawl as verification. Report changes, failed or unavailable checks, and unresolved decisions.

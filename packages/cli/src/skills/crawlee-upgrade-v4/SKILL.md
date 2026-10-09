---
name: crawlee-upgrade-v4
description: Inspect and migrate a JavaScript or TypeScript Crawlee project from v3 to v4, preserving its crawl behavior and storage persistence.
---

# Upgrade Crawlee from v3 to v4

Inspect this project, explain the applicable changes, then migrate it to Crawlee v4 and verify the result. These instructions come from `crawlee upgrade-to-v4`. The supporting files are bundled at `{SKILL_ROOT}` and describe the v4 migration, based on the [Crawlee upgrade guide](https://github.com/apify/crawlee/blob/master/docs/upgrading/upgrading_v4/upgrading_v4.md) and its linked topic pages.

## Inspect and plan

Inspect package manifests, lockfiles, crawler code, tests, runtime versions, CI and Docker installation commands. Identify the package manager, Crawlee packages, crawler types, customized collaborators, and storage and queue reuse. If the project already uses v4, address remaining migration problems rather than upgrading unrelated dependencies.

Inventory every `crawlee`, `@crawlee/*`, `apify`, `apify-*` and `@apify/*` dependency across workspace manifests, including development, optional and peer dependencies. Identify each package's role and distinguish direct dependencies from transitive ones. Crawlee supplies crawling and storage APIs, `apify` supplies Actor lifecycle and platform integration, and `apify-client` calls the Apify REST API. Read the [package map](<{SKILL_ROOT}/references/packages.md>) for individual packages. Check Apify SDK compatibility with the chosen Crawlee release; these packages have independent versions, so do not assign all of them a v4 version or add packages the project does not use.

Read the common checklist below. Search the project for the reference triggers and read the matching files before changing those APIs. Explain which changes apply, propose coherent migration steps, and ask about behavior that cannot be inferred from the code. Preserve the project's intended behavior and module format where supported.

## Git

If the project is in a Git repository, inspect its branch and working tree. Ask once whether you may create a migration branch and make incremental commits there. Existing explicit permission for both is sufficient. Wait for the answer before creating the branch or committing.

If approved, create the branch and migrate one coherent step at a time. Review the diff, run the relevant checks, and commit that step before starting the next. Stage only changes made for this migration. Preserve pre-existing edits; if they overlap, resolve how to separate them with the user. Report failed checks rather than treating an unverified step as complete. Do not push unless asked. If Git is absent or the user declines branching or commits, continue the authorized migration without those Git actions.

## Common changes

- Require Node.js 22.13+ and TypeScript 5.8+ for checking Crawlee's declarations. Crawlee is native ESM; compatible Node and TypeScript versions can still consume it from CommonJS through `require(esm)`. Check runtime images, CI and compiler settings. Stable Cheerio v1 uses `parse5`, so verify parsing-sensitive extraction.
- Rename removed handler options: `handleRequestFunction` and `handlePageFunction` to `requestHandler`, `handleRequestTimeoutSecs` to `requestHandlerTimeoutSecs`, and `handleFailedRequestFunction` to `failedRequestHandler`. Rename `persistCookiesPerSession` to `saveResponseCookies`, `ignoreSslErrors` to `ignoreTlsErrors`, `crawler.stats` to `crawler.statistics`, and successful-request `*Finished*` counters to `*Succeeded*`. Keep `crawlerFinishedAt` unchanged.
- `Configuration` is immutable. Replace `get()` with property reads and `set()` with constructor options. Constructor values now override environment variables. Pass crawler configuration in its `configuration` option instead of a second constructor argument. Services move to `serviceLocator`; details are in [configuration and context](<{SKILL_ROOT}/references/configuration-and-context.md>).
- Navigation and the handler have separate timeout budgets. Navigation hooks share the navigation budget. HTTP hooks lose their second `gotOptions` argument; browser hooks use `context.gotoOptions`. Contexts are strict, `context.error` moves to the handler's second argument, and `context.crawler` is removed. Use a closure or `extendContext`; the latter runs before navigation and cannot read `page`, `$`, `body` or `response` yet.
- HTTP clients, `context.response` and `sendRequest()` use native `Response`. Migrate old status, header and body access. The default client is now impit; an absent impit package falls back to fetch with no proxies or impersonation. Read [HTTP clients and downloads](<{SKILL_ROOT}/references/http-clients-and-downloads.md>) when using responses or custom HTTP options.
- Every crawler uses a session pool. Removed `sessionPoolOptions` becomes an explicit `SessionPool`; configure session settings under `sessionOptions`. Supplied pools and other collaborators remain caller-owned. Session errors use `maxRequestRetries` instead of a separate rotation budget. Browser cookies set during handlers now persist when `saveResponseCookies` is enabled. Read [sessions and proxies](<{SKILL_ROOT}/references/sessions-and-proxies.md>) when changing these options.
- Subsequent crawlers get separate default queues. Repeated `run()` calls keep handled requests, including failures, and do not crawl them again. Preserve intended sharing and reruns explicitly. Do not purge existing user data to make a smoke test pass. Read [requests and links](<{SKILL_ROOT}/references/requests-and-links.md>) before changing queue reuse.
- Handler and hook storage writes are transactional. Failed requests discard buffered writes, but shared `useState()` mutations remain live and queue additions are immediate by default. Other handlers cannot see uncommitted values. Stream writes and destructive storage operations need special handling. Commits across storages are at-least-once. Read [storage](<{SKILL_ROOT}/references/storage.md>) for affected writes and persistence choices.
- URL filters `globs`, `regexps` and `pseudoUrls` become `include`. Patterns now intersect with `strategy`, whose default for `enqueueLinks()` is `same-hostname`. Preserve cross-host or subdomain crawling with an appropriate explicit strategy. Per-pattern request options need top-level options or a transform. Read [requests and links](<{SKILL_ROOT}/references/requests-and-links.md>) before translating patterns.

## Dockerfiles and installation

Inspect every Dockerfile, including build and runtime stages, image tags selected through build arguments, and Apify Actor or browser images. Bump Node.js versions below 22.13 to a compatible image while preserving the image family and required browser support. Use Node.js 24+ if introducing `await using`. Check the Node version in the final image, not just the build stage.

Remove flags and configuration that skip optional dependencies from Docker install or prune commands, package scripts and CI, regardless of package manager. Crawlee's native HTTP and filesystem binaries depend on them. Preserve production-only development-dependency omission and frozen-lockfile behavior. Update the project's Crawlee dependencies together and refresh its existing lockfile. Read [Docker and installation](<{SKILL_ROOT}/references/docker-and-installation.md>) for package-manager equivalents and verification.

## Read when applicable

| Project usage or migration error | Reference |
| --- | --- |
| Crawlee and Apify dependency inventory, package roles and compatibility | [Package map](<{SKILL_ROOT}/references/packages.md>) |
| Dockerfiles, Node image tags, CI installs or skipped optional dependencies | [Docker and installation](<{SKILL_ROOT}/references/docker-and-installation.md>) |
| Configuration services, custom context, validation errors, `log` option | [Configuration and context](<{SKILL_ROOT}/references/configuration-and-context.md>) |
| `SessionPool`, `Session`, cookie helpers, proxy tiers, `createSessionFunction` | [Sessions and proxies](<{SKILL_ROOT}/references/sessions-and-proxies.md>) |
| Browser hooks, `browserPoolOptions`, `browserController`, predictor, Cloudflare, Stagehand | [Browser management](<{SKILL_ROOT}/references/browser-management.md>) |
| Native responses, `gotScraping`, `BaseHttpClient`, `FileDownload` | [HTTP clients and downloads](<{SKILL_ROOT}/references/http-clients-and-downloads.md>) |
| URL filters, enqueue results, queue reuse, request lists, readiness, throttling | [Requests and links](<{SKILL_ROOT}/references/requests-and-links.md>) |
| Storage writes, `MemoryStorage`, `StorageClient`, custom backends, `listItems` | [Storage](<{SKILL_ROOT}/references/storage.md>) |
| `statisticsOptions`, custom `Statistics`, persisted counters | [Statistics](<{SKILL_ROOT}/references/statistics.md>) |
| `autoscaledPoolOptions`, `crawler.autoscaledPool`, snapshotting or load signals | [Concurrency](<{SKILL_ROOT}/references/concurrency.md>) |
| Subclasses, protected overrides, private fields, explicit generics, `RecoverableState` | [Crawler internals](<{SKILL_ROOT}/references/crawler-internals.md>) |
| Missing imports, `@crawlee/core`, `@crawlee/utils`, `@crawlee/types`, JSDOM or LinkeDOM | [Imports and removed symbols](<{SKILL_ROOT}/references/imports-and-removed-symbols.md>) |

## Migrate and verify

Apply only the changes relevant to this project. Preserve persistence when replacing `MemoryStorage`, preserve link scope when translating patterns, and provide initialization and cleanup for collaborators you construct. On Node.js 22, use explicit cleanup with `try`/`finally`; `await using` requires Node.js 24+.

Run the project's type check, relevant tests and build using its package manager. Exercise affected behavior with fixtures or a bounded crawl using isolated storage, including extraction, retries, link filtering or repeated runs where applicable. Report what changed, checks that passed or failed, and anything that still requires the user's decision. Avoid a full production crawl or existing-storage purge as a migration check.

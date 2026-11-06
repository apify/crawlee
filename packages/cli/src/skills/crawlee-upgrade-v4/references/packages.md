# Crawlee and Apify packages

Use this map to identify affected dependencies and imports. Inspect metadata and exports for unlisted packages.

## Crawlee packages

| Package | Purpose |
| --- | --- |
| `crawlee` | Main crawling, storage and utility exports; `crawlee` CLI. |
| `@crawlee/core` | Requests, storage, configuration and services. Crawler-specific APIs move to basic. |
| `@crawlee/basic` | BasicCrawler, sessions, routing, statistics, context composition, request scheduling and concurrency. |
| `@crawlee/http` | HttpCrawler, the DOM-crawler base and FileDownload. |
| `@crawlee/cheerio` | CheerioCrawler: HTTP-based HTML scraping. |
| `@crawlee/browser` | BrowserCrawler base class. |
| `@crawlee/playwright` | PlaywrightCrawler, AdaptivePlaywrightCrawler and Playwright helpers. |
| `@crawlee/puppeteer` | PuppeteerCrawler and Puppeteer helpers. |
| `@crawlee/stagehand` | StagehandCrawler: AI browser automation; separate dependency/import. |
| `@crawlee/browser-pool` | Browser lifecycle, plugins, controllers and shared or remote browser pools. |
| `@crawlee/jsdom` | JSDOMCrawler; separate dependency/import in v4. |
| `@crawlee/linkedom` | LinkeDOMCrawler; separate dependency/import in v4. |
| `@crawlee/http-client` | BaseHttpClient and the fetch-based HTTP client, using native Request and Response. |
| `@crawlee/impit-client` | ImpitHttpClient with browser TLS impersonation and proxy support. The default HTTP client when installed. |
| `@crawlee/got-scraping-client` | Opt-in GotScrapingHttpClient for projects retaining got-scraping behavior. |
| `@crawlee/fs-storage` | FileSystemStorageBackend for persistent local storage. |
| `@crawlee/fs-storage-native` | Native filesystem implementation; platform binaries require optional dependencies. |
| `@crawlee/memory-storage` | Removed. Use fs-storage for disk persistence, core MemoryStorageBackend for memory only. |
| `@crawlee/types` | Shared TypeScript contracts and utility types, including collaborator and storage-backend interfaces. |
| `@crawlee/utils` | HTML, URL, robots and sitemap helpers. `/internal` has no semver guarantees. |
| `@crawlee/otel` | OpenTelemetry instrumentation for Crawlee. |
| `@crawlee/cli` | CLI command implementation. |
| `@crawlee/templates` | Project-template metadata used by the CLI. |

Preserve supported imports. Keep Crawlee packages on compatible v4 releases and declare direct imports as dependencies. `playwright` and `puppeteer` remain separate dependencies.

## Apify packages

| Package | Purpose |
| --- | --- |
| [`apify`](https://docs.apify.com/sdk/js/reference) | Actor lifecycle, input/output, storage, events and proxies. Crawlers come from Crawlee. |
| [`apify-client`](https://docs.apify.com/api/client/js/docs) | REST API client: Actor runs and cloud storage. |
| [`apify-cli`](https://docs.apify.com/cli/docs) | `apify` command for Actor development and platform management. |
| `@apify/log` | Default logging library. Wrap custom instances in ApifyLogAdapter for v4 crawlers. |
| `@apify/consts` | Shared constants. |
| `@apify/datastructures` | Shared data structures. |
| `@apify/timeout` | Promise timeout and cancellation helpers. |
| `@apify/utilities` | Shared utilities. |
| `@apify/validations` | Zod-based argument validation. |
| `@apify/ps-tree` | Process-tree inspection. |
| `@apify/tsconfig` | Shared TypeScript configuration. |
| `@apify/oxlint-config` | Shared lint configuration. |
| `@apify/pseudo_url` | Legacy pseudo-URLs, removed from Crawlee v4; translate to globs/regexps. |
| `apify-node-curl-impersonate` | curl-impersonate HTTP wrapper; separate from Crawlee's impit client. |

Actor projects need the Apify SDK v4 line: Apify SDK 3.x does not run on `@crawlee/core@4`, so install `apify@4` together with Crawlee v4. The SDK has its own breaking changes; review them after the bump. Preserve Actor lifecycle and platform integration; retain Actor storage methods.

The other Apify packages version independently: do not bump every helper to v4. Check their dependency/peer compatibility, especially for cloud storage.

Update Apify packages only for compatibility or affected APIs. Do not promote transitive helpers to direct dependencies.

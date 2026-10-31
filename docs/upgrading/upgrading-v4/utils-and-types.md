---
id: utils-and-types
title: 'Upgrading to v4: `@crawlee/utils` and `@crawlee/types`'
sidebar_label: Utils and types packages
sidebar_position: 9
slug: /upgrading/upgrading-to-v4/utils-and-types
---

Applies when you import utility functions, enums or types directly from `@crawlee/utils` or `@crawlee/types`, rather than only using the crawlers. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## Available resource detection

In v3, we introduced a new way to detect available resources for the crawler, available via `systemInfoV2` flag. In v4, this is the default way to detect available resources. The old way is removed completely together with the `systemInfoV2` flag.

As part of this change, the low-level resource- and environment-detection helpers exported from `@crawlee/utils` were **removed**: `getMemoryInfo()` (and the `MemoryInfo` interface), `isContainerized()`, `isDocker()`, `isLambda()`, and `getCgroupsVersion()`. These backed the old detection path and are no longer part of the public API. Resource detection is now handled internally by the crawler's autoscaling; if you called any of these directly, read the equivalent values from the OS (`node:os`) or the relevant cgroup files yourself.

## `@crawlee/types` symbols are no longer re-exported

The general-purpose utility types owned by `@crawlee/types` are no longer re-exported from other packages, so `Dictionary`, `Awaitable`, `Constructor`, `Cookie`, `QueueOperationInfo` and `AllowedHttpMethods` are no longer available from `@crawlee/core` (nor, in turn, from `@crawlee/basic` and the `crawlee` meta-package). Add `@crawlee/types` to your dependencies and import them from there — most of the package's types (`ISession`, `ProxyInfo`, `RequestSchema`, …) already required this. The interfaces you implement against — `StorageBackend`, `StorageIdentifier` and `IBrowserPool` / `NewPageOptions` — stay reachable from `@crawlee/core` and `@crawlee/browser-pool` respectively.

## Removed and relocated `@crawlee/utils` exports

Besides the resource-detection helpers above, several other `@crawlee/utils` exports were removed or moved:

- **Removed URL helpers:** `filterUrl(target, origin, strategy)`, `matchesEnqueueStrategy(strategy, target, origin)`, and the `UNSUPPORTED_SCHEME_MESSAGE` constant. URL filtering by enqueue strategy is now internal to `enqueueLinks`. The related `filterRequestsByPatterns(requests, patterns?, onSkippedUrl?)` function (from `@crawlee/core`) was removed for the same reason — pattern-based request filtering now happens inside `enqueueLinks`.
- **Relocated types:** `SearchParams` is now exported from `@crawlee/types` and no longer from `@crawlee/utils`. `EnqueueStrategy` stays in `@crawlee/utils` and is re-exported by `@crawlee/core` and `crawlee`.
- **Removed `RobotsFile` alias:** `RobotsFile` was an alias for the `RobotsTxtFile` class and is removed. Rename any usage to `RobotsTxtFile`; the class itself is unchanged apart from the signature change described below.
- **Split into public and `/internal` entry points:** the main `@crawlee/utils` entry now exposes only the user-facing helpers (`sleep`, `htmlToText`, `extractUrls`, `downloadListOfUrls`, the `social` namespace, the Open Graph parser, and the robots/sitemap utilities `RobotsTxtFile`, `Sitemap` and `discoverValidSitemaps`). Helpers that primarily serve the crawler packages - e.g. `URL_NO_COMMAS_REGEX`, `URL_WITH_COMMAS_REGEX`, `extractUrlsFromCheerio`, `tryAbsoluteURL`, `expandShadowRoots`, and the blocked-detection and iterable helpers - moved to the `@crawlee/utils/internal` entry point, which carries no semver guarantees. They keep working, but imports need updating: `import { URL_NO_COMMAS_REGEX } from '@crawlee/utils/internal'`.
- **Removed `CheerioRoot` and the cheerio type re-exports:** `CheerioRoot` was an alias for cheerio's own `CheerioAPI` and is gone; `parseWithCheerio()` and `htmlToText()` are typed with `CheerioAPI` directly. The crawler packages also no longer re-export `Cheerio`, `CheerioAPI` and `Element`, so `import type { CheerioAPI } from 'crawlee'` (or from `@crawlee/basic` / `@crawlee/puppeteer` / ...) breaks - import them from `cheerio` and `domhandler`, which are the packages that own them.
- **`parseSitemap` and `expandShadowRoots` are no longer on the main entry:** `parseSitemap()` (together with the `SitemapUrl` type) moved to `@crawlee/utils/internal`; use the documented `Sitemap.load()` / `Sitemap.fromXmlString()` / `Sitemap.tryCommonNames()` statics, or `discoverValidSitemaps()`, which stay on `@crawlee/utils`. `expandShadowRoots()` moved there too — it is a DOM function that is serialized into a browser page, not a Node helper. Because the `crawlee` meta-package re-exports `@crawlee/utils` wholesale, `import { parseSitemap } from 'crawlee'` (and the same for `expandShadowRoots`) breaks as well.

### `RobotsTxtFile.find` signature changed; sitemap options removed

The `proxyUrl` argument of `RobotsTxtFile.find()` moved from a positional parameter into the options bag, which also gained `httpClient` and `logger`:

**Before:**
```typescript
const robots = await RobotsTxtFile.find(url, proxyUrl, { timeoutMillis: 5000 });
```

**After:**
```typescript
const robots = await RobotsTxtFile.find(url, { proxyUrl, timeoutMillis: 5000 });
```

Relatedly, the `networkTimeouts` option was dropped from `ParseSitemapOptions`; use the single `timeoutMillis` option instead. `RobotsTxtFile.getSitemaps()`, `parseSitemaps()` and `parseUrlsFromSitemaps()` still accept an optional `RobotsTxtFileSitemapsOptions` bag, whose `enqueueStrategy` option (default `'same-hostname'`) keeps only sitemap URLs on the robots.txt host — pass `'all'` to disable that filtering. Non-`http(s)` sitemap URLs are always dropped.

## HTML-parsing helper functions are now asynchronous

The HTML-parsing helper functions `htmlToText`, `parseHandlesFromHtml` and `parseOpenGraph` are now asynchronous and return promises.

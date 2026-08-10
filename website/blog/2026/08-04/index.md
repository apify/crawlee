---
slug: crawlee-v3-18
title: "Crawlee v3.18: Type-safe routers"
description: "Crawlee v3.18 brings type-safe router labels, opt-in runtime validation of request userData via Zod and other Standard Schema libraries, puppeteer@25 support, and a batch of reliability fixes."
authors: [B4nan]
---

Crawlee v3.18 is out. The main feature this time is a long-requested one: the router can now type `request.userData` per label, and optionally validate it at runtime with a schema. There is also `puppeteer@25` support and a batch of bug fixes. Since we skipped the blog post for v3.17, this post covers its two features as well.

- [Type-safe router labels](/blog/crawlee-v3-18#type-safe-router-labels)
- [Schema validation of userData](/blog/crawlee-v3-18#schema-validation-of-userdata)
- [Other changes](/blog/crawlee-v3-18#other-changes)
- [What landed in v3.17](/blog/crawlee-v3-18#what-landed-in-v317)

<!-- truncate -->

## Type-safe router labels

Until now, `request.userData` was a loosely typed dictionary. Every handler saw the same shape, regardless of which label it was registered for, and a typo in a label name was silently accepted. If you wanted type safety, you had to cast or narrow the type yourself in every handler.

In v3.18 you can declare a route map (one `userData` shape per label) and pass it as a type argument to the router factory:

```typescript
import { createCheerioRouter } from 'crawlee';
import type { CheerioCrawlingContext } from 'crawlee';

interface Routes {
    PRODUCT: { sku: string; price: number };
    CATEGORY: { categoryId: string };
}

const router = createCheerioRouter<CheerioCrawlingContext, Routes>();

router.addHandler('PRODUCT', async ({ request }) => {
    request.userData.sku; // string
    request.userData.price; // number
});

// compile error: 'TYPO' is not a label declared in the route map
router.addHandler('TYPO', async () => {});
```

Each handler gets `request.userData` typed according to its label, and unknown labels fail at compile time. All of this happens at the type level, so there is no runtime cost. It is also backwards compatible: omit the route map and you keep the original loose typing, and passing a plain `userData` shape (the old single-type style) still works exactly as before.

## Schema validation of userData

The route map above only exists at the type level. If your `userData` comes from an untyped source, say an Actor input or a value scraped from a page, a wrong shape can still slip through at runtime. For that case, the router factories now accept a schema per label instead of a type argument. Any [Standard Schema](https://standardschema.dev) compliant library works: [Zod](https://zod.dev), [Valibot](https://valibot.dev), [ArkType](https://arktype.io), and others. One map then drives both the inferred `userData` type and its runtime validation:

```typescript
import { createCheerioRouter } from 'crawlee';
import { z } from 'zod';

const router = createCheerioRouter({
    PRODUCT: z.object({ sku: z.string(), price: z.coerce.number() }),
    CATEGORY: z.object({ categoryId: z.string() }),
});

router.addHandler('PRODUCT', async ({ request }) => {
    request.userData.sku; // string — inferred from the schema
    request.userData.price; // number — coerced before the handler runs
});
```

When a request is handled, its `userData` is validated against the schema registered for its label and replaced with the parsed (and coerced) value before the handler runs. The same schemas also validate `userData` when requests are added through the crawler (via `crawler.addRequests()`, `crawler.run()`, and the `addRequests`/`enqueueLinks` context helpers), so a bad shape fails fast when you insert the request, not deep inside a handler. A mismatch throws the new [`RequestValidationError`](https://crawlee.dev/js/api/core/class/RequestValidationError), which is non-retryable, since re-running the request would fail identically.

To validate requests handled by the default route, register a schema under the exported `defaultRoute` key. The default handler's `request.userData` is then typed from that schema too:

```typescript
import { createCheerioRouter, defaultRoute } from 'crawlee';
import { z } from 'zod';

const router = createCheerioRouter({
    PRODUCT: z.object({ sku: z.string() }),
    [defaultRoute]: z.object({ page: z.coerce.number() }),
});

router.addDefaultHandler(async ({ request }) => {
    request.userData.page; // number — validated and coerced by the defaultRoute schema
});
```

The whole thing is opt-in. A router created without a schema map behaves exactly as it did before, and labels without a registered schema are left alone. Also note that the schema map and the type-only route map are alternative styles, not layers: a schema map already infers the `userData` types, so you don't pass a `<Context, Routes>` type argument on top of it. Both are documented in the [TypeScript projects guide](https://crawlee.dev/js/docs/guides/typescript-project).

## Other changes

A few of the smaller changes in this release are worth calling out:

- `PuppeteerCrawler` now supports `puppeteer@25`, and the peer dependency range has been updated accordingly. Older versions down to `puppeteer@21` keep working ([#3869](https://github.com/apify/crawlee/pull/3869)).
- `enqueueLinks` keeps the same-domain filtering anchored to the original request even after an off-domain redirect, so a redirect to a different domain no longer causes the crawler to wander off ([#3923](https://github.com/apify/crawlee/pull/3923)).
- URLs discovered from sitemaps are now filtered by the configured enqueue strategy, same as links found on pages ([#3797](https://github.com/apify/crawlee/pull/3797)).
- `addRequestsBatched` no longer re-submits requests that were already enqueued, and retries for unprocessed requests are capped instead of looping forever ([#3843](https://github.com/apify/crawlee/pull/3843), [#3765](https://github.com/apify/crawlee/pull/3765)).
- A backpressured sitemap load no longer deadlocks when `persistState` fires mid-crawl ([#3863](https://github.com/apify/crawlee/pull/3863)).
- The final crawler statistics are persisted once instead of twice ([#3866](https://github.com/apify/crawlee/pull/3866)).
- Returning a falsy value from `transformRequestFunction` in the context-aware `enqueueLinks` now skips the request as documented ([#3925](https://github.com/apify/crawlee/pull/3925)).

## What landed in v3.17

We didn't write a blog post for v3.17 (released in June), so here's a quick recap of its two features.

### Dynamic memory snapshots

The [`Snapshotter`](https://crawlee.dev/js/api/core/class/Snapshotter) previously measured the available memory once at startup and stuck with that number for the whole crawl. In environments where the memory limit can change while the crawler runs, for example a container that gets resized, the autoscaling either under-used the available memory or pushed past it. When no fixed `memoryMbytes` is configured, the snapshotter now follows the total memory reported by the event manager and scales with it.

### Custom load signals for autoscaling

The autoscaling internals were refactored around a new `LoadSignal` interface. `SystemStatus` aggregates a set of load signals to decide whether the system is overloaded, and the built-in ones (memory, CPU, event loop, and API client rate limits) are now separate composable classes. You can implement the interface yourself and pass extra signals to the [`AutoscaledPool`](https://crawlee.dev/js/api/core/class/AutoscaledPool) via `loadSignals`, so the crawler can react to overload conditions that Crawlee doesn't know about, such as navigation timeouts or proxy health.

---

That's it for v3.18. The full list of changes is in the [changelog on GitHub](https://github.com/apify/crawlee/blob/master/CHANGELOG.md). If you run into problems or have questions, [open a GitHub discussion](https://github.com/apify/crawlee/discussions) or [join our Discord](https://apify.com/discord).

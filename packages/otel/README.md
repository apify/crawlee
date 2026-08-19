# @crawlee/otel

This package provides [OpenTelemetry](https://opentelemetry.io/) instrumentation for Crawlee. It traces the request
handling pipeline of the crawlers and forwards Crawlee logs to OpenTelemetry, so you can analyze crawler runs in any
OpenTelemetry-compatible backend (Jaeger, Zipkin, Signoz, ...).

For a step-by-step walkthrough, including setting up a local Jaeger instance, see the
[Trace and monitor crawlers](https://crawlee.dev/js/docs/guides/trace-and-monitor-crawlers) guide.

## Installation

The OpenTelemetry API packages are peer dependencies, so install them alongside this package:

```bash
npm install @crawlee/otel @opentelemetry/api @opentelemetry/api-logs @opentelemetry/sdk-node
```

## Example usage

Register `CrawleeInstrumentation` with the OpenTelemetry SDK **before** Crawlee is imported - the instrumentation
patches the crawler classes as they are loaded. The usual way to guarantee that is a separate setup file:

```typescript
// setup.ts
import { CrawleeInstrumentation } from '@crawlee/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';

export const sdk = new NodeSDK({
    instrumentations: [new CrawleeInstrumentation()],
    // ... exporters and resource configuration
});

sdk.start();
```

```bash
node --import ./setup.js ./main.js
```

Spans for `BasicCrawler`, `HttpCrawler` and `BrowserCrawler` request handling are then created automatically.

## Instrumenting your own handlers

Use `wrapWithSpan` to put your own code on the trace. The span name and attributes can be derived from the arguments
the wrapped function receives:

```typescript
import { CheerioCrawler } from '@crawlee/cheerio';
import { wrapWithSpan } from '@crawlee/otel';
import { context, trace } from '@opentelemetry/api';

const crawler = new CheerioCrawler({
    requestHandler: wrapWithSpan(
        async ({ request, $ }) => {
            trace.getSpan(context.active())?.setAttribute('page.title', $('title').text());
        },
        { spanName: ({ request }) => `scrape ${request.url}` },
    ),
});
```

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `requestHandlingInstrumentation` | `true` | Instrument the core request handling methods of the crawlers. |
| `logInstrumentation` | `true` | Forward Crawlee logs to OpenTelemetry logs. |
| `customInstrumentation` | `[]` | Additional `@crawlee/*` class methods to instrument. |

## A note on linked installs

The automatic instrumentation patches the Crawlee classes when their module is loaded, which requires the package to
resolve to a path inside a `node_modules` directory. That is true of a normal install (npm, yarn and pnpm alike), but
not of a package symlinked out to a working copy - `npm link`, a `file:` dependency, or a workspace in this monorepo.
Node resolves those to their real location, which has no `node_modules` segment, so the hook cannot match the file back
to the package name and no spans are produced. Either run Node with `--preserve-symlinks --preserve-symlinks-main`, so
that the symlinked path is kept and the hook can match it, or use `wrapWithSpan`, which does not rely on patching.

> This package is part of the [Crawlee](https://crawlee.dev) monorepo.

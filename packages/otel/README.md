# @crawlee/otel

This package provides [OpenTelemetry](https://opentelemetry.io/) instrumentation for Crawlee. It traces the request
handling pipeline of the crawlers and forwards Crawlee logs to OpenTelemetry, so you can analyze crawler runs in any
OpenTelemetry-compatible backend (Jaeger, Zipkin, Signoz, ...).

## Installation

The OpenTelemetry API packages are peer dependencies, so install them alongside this package:

```bash
npm install @crawlee/otel @opentelemetry/api @opentelemetry/api-logs @opentelemetry/sdk-node
```

## Example usage

Crawlee is published as ECMAScript modules, so the crawler classes can only be patched through Node's module hook.
Register it in its own file, preloaded ahead of everything else:

```typescript
// register-hook.ts
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('@opentelemetry/instrumentation/hook.mjs', pathToFileURL('./'));
```

Then configure the SDK in a setup file, which also has to load before Crawlee:

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
node --import ./register-hook.js --import ./setup.js ./main.js
```

Without the hook the crawler runs normally but no spans are produced. Register it with `register()` from a preloaded
file as shown - `--experimental-loader=@opentelemetry/instrumentation/hook.mjs` patches the classes but the spans do
not come out the other end.

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

> This package is part of the [Crawlee](https://crawlee.dev) monorepo.

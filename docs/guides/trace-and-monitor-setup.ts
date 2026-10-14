import { CrawleeInstrumentation } from '@crawlee/otel';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Create a resource that identifies your service
const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'my-crawler',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': 'development',
});

// Configure exporters to send data to Jaeger via OTLP
// The gRPC exporter takes the collector endpoint without a signal path - unlike the HTTP one,
// which would use `http://localhost:4318/v1/traces`.
const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:4317',
});

// Create the Crawlee instrumentation
const crawleeInstrumentation = new CrawleeInstrumentation();

// Initialize the OpenTelemetry SDK
export const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [crawleeInstrumentation],
});

// Start the SDK
sdk.start();

console.log('OpenTelemetry initialized');

// This file is preloaded before the crawler, so it also owns flushing the buffered telemetry on the way out.
let shuttingDown: Promise<void> | undefined;

const shutdown = () => {
    // Every handler below can fire, and the SDK must only be shut down once.
    shuttingDown ??= sdk.shutdown();
    return shuttingDown;
};

// `beforeExit` covers a script that simply runs to completion. The flush it starts is async work, so Node keeps the
// process alive for it and then fires `beforeExit` once more - hence `on` rather than `once`, and hence `shutdown`
// having to be idempotent.
process.on('beforeExit', () => {
    void shutdown();
});

// Signals have to be handled separately, as they do not emit `beforeExit`. `SIGINT` is the one you send by pressing
// Ctrl-C, so without it a local run loses whatever the exporter had not sent yet.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        void shutdown().then(() => process.exit(0));
    });
}

import { CrawleeInstrumentation } from '@crawlee/otel';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_SERVICE_NAME, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

const crawleeInstrumentation = new CrawleeInstrumentation({
    // Disable default request handling instrumentation
    requestHandlingInstrumentation: false,
    // Disable log forwarding to OpenTelemetry
    logInstrumentation: false,
    // Define custom methods to instrument
    customInstrumentation: [
        {
            moduleName: '@crawlee/basic',
            className: 'BasicCrawler',
            methodName: 'run',
            spanName: 'crawler.run',
            spanOptions() {
                return {
                    attributes: {
                        'crawler.type': this.constructor.name,
                    },
                };
            },
        },
        {
            moduleName: '@crawlee/basic',
            className: 'BasicCrawler',
            methodName: 'runRequestHandler',
            // Dynamic span name using the context argument
            spanName(context: any) {
                return `request ${context.request.url}`;
            },
            spanOptions(context: any) {
                return {
                    attributes: {
                        [ATTR_URL_FULL]: context.request.url,
                        [ATTR_HTTP_REQUEST_METHOD]: context.request.method,
                    },
                };
            },
        },
    ],
});

const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'custom-instrumented-crawler',
});

const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:4317',
});

export const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [crawleeInstrumentation],
});

sdk.start();

// Like the setup file above, this one is preloaded before the crawler, so it also owns flushing the buffered
// telemetry on the way out - without this the batched spans are dropped when the process exits.
const shutdown = async () => {
    await sdk.shutdown();
};

// `beforeExit` covers a script that simply runs to completion...
process.once('beforeExit', () => {
    void shutdown();
});

// ...while signals have to be handled separately, as they do not emit `beforeExit`.
process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
});

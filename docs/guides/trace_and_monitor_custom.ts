import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { CrawleeInstrumentation } from '@crawlee/otel';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

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
            moduleName: '@crawlee/http',
            className: 'HttpCrawler',
            methodName: '_runRequestHandler',
            // Dynamic span name using the context argument
            spanName(context: any) {
                return `http.request ${context.request.url}`;
            },
            spanOptions(context: any) {
                return {
                    attributes: {
                        'http.url': context.request.url,
                        'http.method': context.request.method,
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
    url: 'http://localhost:4317/v1/traces',
});

export const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    instrumentations: [crawleeInstrumentation],
});

sdk.start();

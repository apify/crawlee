import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { CrawleeInstrumentation } from '@crawlee/otel';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Create a resource that identifies your service
const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'my-crawler',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': 'development',
});

// Configure exporters to send data to Jaeger via OTLP
const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:4317/v1/traces',
});

const logExporter = new OTLPLogExporter({
    url: 'http://localhost:4317/v1/logs',
});

// Create the Crawlee instrumentation
const crawleeInstrumentation = new CrawleeInstrumentation();

// Initialize the OpenTelemetry SDK
export const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    logRecordProcessors: [new BatchLogRecordProcessor(logExporter)],
    instrumentations: [crawleeInstrumentation],
});

// Start the SDK
sdk.start();

console.log('OpenTelemetry initialized');

// Graceful shutdown
process.on('SIGTERM', async () => {
    await sdk.shutdown();
    process.exit(0);
});

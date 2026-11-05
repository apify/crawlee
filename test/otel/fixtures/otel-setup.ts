import { writeFileSync } from 'node:fs';

import { CrawleeInstrumentation } from '@crawlee/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();

const sdk = new NodeSDK({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    instrumentations: [new CrawleeInstrumentation({ logInstrumentation: false })],
});

sdk.start();

// `SimpleSpanProcessor` hands every span over as it ends, so by the time the process is on its way out the exporter
// holds everything. Written from `exit` so the crawler script itself stays a plain crawler, exactly like the guide's.
process.on('exit', () => {
    const output = process.env.CRAWLEE_OTEL_SMOKE_OUTPUT;
    if (output) {
        writeFileSync(output, JSON.stringify(exporter.getFinishedSpans().map((span) => span.name)));
    }
});

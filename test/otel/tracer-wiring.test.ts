import { CrawleeInstrumentation, wrapWithSpan } from '@crawlee/otel';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

// Reached directly rather than through the package entry point: resetting the shared tracer is not public API.
import { setSharedTracer } from '../../packages/otel/src/wrapWithSpan.js';

/**
 * The instrumentation is always constructed before the SDK is configured, so these tests cover that ordering for
 * both ways a provider reaches it: registered globally, or handed over explicitly. The explicit case used to emit
 * nothing at all, because the tracer was taken from the global API in the constructor and that provider never gets
 * a delegate when the SDK does not register itself globally.
 */
describe('tracer wiring', () => {
    const scopeOf = (span: ReadableSpan) => (span.instrumentationScope ?? (span as any).instrumentationLibrary)?.name;

    // `wrapWithSpan` shares one tracer per process, so a test that asserts the fallback has to start from a clean one
    // no matter which of these ran first.
    beforeEach(() => setSharedTracer(undefined));

    test('emits spans when the provider is registered globally', async () => {
        const exporter = new InMemorySpanExporter();

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        void instrumentation;

        const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
        provider.register();

        try {
            wrapWithSpan(() => 'value', { spanName: 'global-provider' })();

            const spans = exporter.getFinishedSpans();
            expect(spans.map((s) => s.name)).toEqual(['global-provider']);
            expect(scopeOf(spans[0])).toBe('@crawlee/otel');
        } finally {
            await provider.shutdown();
        }
    });

    test('emits spans when the provider is passed to registerInstrumentations instead of registered', async () => {
        const exporter = new InMemorySpanExporter();

        // Constructed before the provider exists, and the provider is never registered globally.
        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

        const unregister = registerInstrumentations({
            instrumentations: [instrumentation],
            tracerProvider: provider,
        });

        try {
            wrapWithSpan(() => 'value', { spanName: 'explicit-provider' })();

            const spans = exporter.getFinishedSpans();
            expect(spans.map((s) => s.name)).toEqual(['explicit-provider']);
            expect(scopeOf(spans[0])).toBe('@crawlee/otel');
        } finally {
            unregister();
            await provider.shutdown();
        }
    });
});

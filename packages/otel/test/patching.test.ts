import { CrawleeInstrumentation } from '@crawlee/otel';
import { SeverityNumber } from '@opentelemetry/api-logs';
import type { LogRecord } from '@opentelemetry/sdk-logs';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
    ATTR_CODE_FUNCTION_NAME,
    ATTR_EXCEPTION_MESSAGE,
    ATTR_EXCEPTION_STACKTRACE,
    ATTR_EXCEPTION_TYPE,
    ATTR_HTTP_REQUEST_METHOD,
    ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';

/**
 * Applies the module patches produced by `init()` to a stub module, which lets us assert what the instrumentation
 * actually does to the patched classes without going through the module loader hooks.
 */
function patchModule(instrumentation: CrawleeInstrumentation, moduleName: string, moduleExports: any) {
    const definition = (instrumentation as any).init().find((d: any) => d.name === moduleName) as {
        patch: (e: any) => any;
        unpatch: (e: any) => any;
    };

    expect(definition).toBeDefined();
    definition.patch(moduleExports);

    return definition;
}

describe('automatic instrumentation', () => {
    let provider: NodeTracerProvider;
    let exporter: InMemorySpanExporter;
    let processor: SimpleSpanProcessor;

    beforeAll(() => {
        exporter = new InMemorySpanExporter();
        processor = new SimpleSpanProcessor(exporter);
        provider = new NodeTracerProvider({ spanProcessors: [processor] });
        provider.register();
    });

    beforeEach(() => exporter.reset());

    afterAll(async () => {
        await provider.shutdown();
    });

    test('wraps the configured method and records request attributes', async () => {
        class HttpCrawler {
            public seen: string[] = [];

            async _runRequestHandler(crawlingContext: { request: { url: string } }) {
                this.seen.push(crawlingContext.request.url);
                return 'handled';
            }
        }

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        patchModule(instrumentation, '@crawlee/http', { HttpCrawler });

        const crawler = new HttpCrawler();
        const context = { request: { id: 'req-1', url: 'https://example.com', method: 'GET', retryCount: 2 } };

        await expect(crawler._runRequestHandler(context)).resolves.toBe('handled');
        // The original behaviour is preserved.
        expect(crawler.seen).toEqual(['https://example.com']);

        await processor.forceFlush();

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].name).toBe('crawlee.http.runRequestHandler');
        expect(spans[0].attributes).toEqual({
            'crawlee.request.id': 'req-1',
            [ATTR_URL_FULL]: 'https://example.com',
            [ATTR_HTTP_REQUEST_METHOD]: 'GET',
            'crawlee.request.retry_count': 2,
            [ATTR_CODE_FUNCTION_NAME]: 'HttpCrawler._runRequestHandler',
        });
    });

    test('nests the spans of nested instrumented calls', async () => {
        class BasicCrawler {
            async run() {
                return this._runTaskFunction();
            }

            async _runTaskFunction() {
                return 'done';
            }
        }

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        patchModule(instrumentation, '@crawlee/basic', { BasicCrawler });

        await new BasicCrawler().run();
        await processor.forceFlush();

        const spans = exporter.getFinishedSpans();
        const run = spans.find((s: ReadableSpan) => s.name === 'crawlee.crawler.run')!;
        const task = spans.find((s: ReadableSpan) => s.name === 'crawlee.crawler.runTaskFunction')!;

        expect(run).toBeDefined();
        expect(task).toBeDefined();
        expect(task.parentSpanContext?.spanId).toBe(run.spanContext().spanId);
        expect(task.spanContext().traceId).toBe(run.spanContext().traceId);
        // `run` records the concrete crawler class, resolved through `this`.
        expect(run.attributes['crawlee.crawler.type']).toBe('BasicCrawler');
    });

    test('records the exception and rethrows when the patched method fails', async () => {
        class BasicCrawler {
            async run(): Promise<void> {
                throw new Error('crawl failed');
            }
        }

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        patchModule(instrumentation, '@crawlee/basic', { BasicCrawler });

        await expect(new BasicCrawler().run()).rejects.toThrow('crawl failed');
        await processor.forceFlush();

        const span = exporter.getFinishedSpans().find((s: ReadableSpan) => s.name === 'crawlee.crawler.run')!;
        expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
        expect(span.events.map((e) => e.name)).toContain('exception');
    });

    test('unpatch restores the original method', async () => {
        class BasicCrawler {
            async run() {
                return 'ok';
            }
        }

        const original = BasicCrawler.prototype.run;
        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        const definition = patchModule(instrumentation, '@crawlee/basic', { BasicCrawler });

        expect(BasicCrawler.prototype.run).not.toBe(original);

        definition.unpatch({ BasicCrawler });

        expect(BasicCrawler.prototype.run).toBe(original);

        await new BasicCrawler().run();
        await processor.forceFlush();
        expect(exporter.getFinishedSpans()).toHaveLength(0);
    });

    test('skips a method that does not exist in the installed version instead of throwing', () => {
        class BasicCrawler {}

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });

        // A version of `@crawlee/basic` without the instrumented internals must still load.
        expect(() => patchModule(instrumentation, '@crawlee/basic', { BasicCrawler })).not.toThrow();
    });

    test('skips a class that is not exported by the module instead of throwing', () => {
        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });

        expect(() => patchModule(instrumentation, '@crawlee/basic', {})).not.toThrow();
    });

    test('tolerates an explicitly undefined customInstrumentation', () => {
        expect(() => new CrawleeInstrumentation({ customInstrumentation: undefined })).not.toThrow();
    });
});

describe('log instrumentation', () => {
    let loggerProvider: LoggerProvider;
    let logExporter: InMemoryLogRecordExporter;

    beforeAll(() => {
        logExporter = new InMemoryLogRecordExporter();
        loggerProvider = new LoggerProvider({
            processors: [new SimpleLogRecordProcessor(logExporter)],
        });
    });

    beforeEach(() => logExporter.reset());

    afterAll(async () => {
        await loggerProvider.shutdown();
    });

    /** Minimal stand-in for the `@apify/log` `Log` class. */
    function createLogModule(level = 4) {
        const calls: unknown[][] = [];

        class Log {
            getLevel() {
                return level;
            }

            internal(...args: unknown[]): void {
                calls.push(args);
            }
        }

        return { moduleExports: { Log }, calls };
    }

    function patchLog(moduleExports: any) {
        const instrumentation = new CrawleeInstrumentation({ requestHandlingInstrumentation: false });
        instrumentation.setLoggerProvider(loggerProvider);

        const definition = (instrumentation as any).init().find((d: any) => d.name === '@apify/log') as {
            patch: (e: any) => any;
        };

        definition.patch(moduleExports);
    }

    test('forwards log records and keeps calling the original method', () => {
        const { moduleExports, calls } = createLogModule();
        patchLog(moduleExports);

        new moduleExports.Log().internal(4, 'hello', { foo: 'bar' });

        expect(calls).toEqual([[4, 'hello', { foo: 'bar' }, undefined]]);

        const records = logExporter.getFinishedLogRecords();
        expect(records).toHaveLength(1);
        expect(records[0].body).toBe('hello');
        expect(records[0].severityNumber).toBe(SeverityNumber.INFO);
        expect(records[0].severityText).toBe('INFO');
        expect(records[0].attributes).toEqual({ foo: 'bar' });
    });

    test('returns void, so the original synchronous contract is preserved', () => {
        const { moduleExports } = createLogModule();
        patchLog(moduleExports);

        expect(new moduleExports.Log().internal(4, 'hello')).toBeUndefined();
    });

    test('maps an exception onto the semantic convention attributes', () => {
        const { moduleExports } = createLogModule();
        patchLog(moduleExports);

        const error = new TypeError('boom');
        new moduleExports.Log().internal(1, 'failed', undefined, error);

        const record = logExporter.getFinishedLogRecords()[0] as LogRecord;
        expect(record.severityNumber).toBe(SeverityNumber.ERROR);
        expect(record.attributes[ATTR_EXCEPTION_TYPE]).toBe('TypeError');
        expect(record.attributes[ATTR_EXCEPTION_MESSAGE]).toBe('boom');
        expect(record.attributes[ATTR_EXCEPTION_STACKTRACE]).toContain('TypeError: boom');
    });

    test('does not forward records below the configured log level', () => {
        const { moduleExports, calls } = createLogModule(3); // WARNING
        patchLog(moduleExports);

        new moduleExports.Log().internal(5, 'debug message');

        expect(logExporter.getFinishedLogRecords()).toHaveLength(0);
        // The original still decides what to print.
        expect(calls).toHaveLength(1);
    });
});

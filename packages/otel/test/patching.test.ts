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

            async makeHttpRequest(crawlingContext: { request: { url: string } }) {
                this.seen.push(crawlingContext.request.url);
                return 'handled';
            }
        }

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        patchModule(instrumentation, '@crawlee/http', { HttpCrawler });

        const crawler = new HttpCrawler();
        const context = { request: { id: 'req-1', url: 'https://example.com', method: 'GET', retryCount: 2 } };

        await expect(crawler.makeHttpRequest(context)).resolves.toBe('handled');
        // The original behaviour is preserved.
        expect(crawler.seen).toEqual(['https://example.com']);

        await processor.forceFlush();

        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(1);
        expect(spans[0].name).toBe('crawlee.http.makeHttpRequest');
        expect(spans[0].attributes).toEqual({
            'crawlee.request.id': 'req-1',
            [ATTR_URL_FULL]: 'https://example.com',
            [ATTR_HTTP_REQUEST_METHOD]: 'GET',
            'crawlee.request.retry_count': 2,
            [ATTR_CODE_FUNCTION_NAME]: 'HttpCrawler.makeHttpRequest',
        });
    });

    test('nests the spans of nested instrumented calls', async () => {
        class BasicCrawler {
            async run() {
                return this.handleRequest();
            }

            async handleRequest() {
                return 'done';
            }
        }

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        patchModule(instrumentation, '@crawlee/basic', { BasicCrawler });

        await new BasicCrawler().run();
        await processor.forceFlush();

        const spans = exporter.getFinishedSpans();
        const run = spans.find((s: ReadableSpan) => s.name === 'crawlee.crawler.run')!;
        const task = spans.find((s: ReadableSpan) => s.name === 'crawlee.crawler.handleRequest')!;

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

    /**
     * Minimal stand-in for `BaseCrawleeLogger`, mirroring how the real one derives every logging method from the
     * abstract `logWithLevel` that each adapter implements.
     */
    function createLogModule() {
        const calls: unknown[][] = [];

        class BaseCrawleeLogger {
            logWithLevel(...args: unknown[]): void {
                calls.push(args);
            }

            error(message: string, data?: Record<string, unknown>) {
                this.logWithLevel(1, message, data);
            }

            exception(exception: Error, message: string, data?: Record<string, unknown>) {
                this.logWithLevel(1, `${message}: ${exception.message}`, { ...data, exception });
            }

            warning(message: string, data?: Record<string, unknown>) {
                this.logWithLevel(3, message, data);
            }

            warningOnce(message: string) {
                this.warning(message);
            }

            info(message: string, data?: Record<string, unknown>) {
                this.logWithLevel(4, message, data);
            }
        }

        return { moduleExports: { BaseCrawleeLogger }, calls };
    }

    function patchLog(moduleExports: any) {
        const instrumentation = new CrawleeInstrumentation({ requestHandlingInstrumentation: false });
        instrumentation.setLoggerProvider(loggerProvider);

        const definition = (instrumentation as any).init().find((d: any) => d.name === '@crawlee/core') as {
            patch: (e: any) => any;
        };

        definition.patch(moduleExports);
    }

    test('forwards log records and keeps calling the original method', () => {
        const { moduleExports, calls } = createLogModule();
        patchLog(moduleExports);

        new moduleExports.BaseCrawleeLogger().info('hello', { foo: 'bar' });

        // The original still runs, so the underlying logger keeps printing.
        expect(calls).toEqual([[4, 'hello', { foo: 'bar' }]]);

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

        expect(new moduleExports.BaseCrawleeLogger().info('hello')).toBeUndefined();
    });

    test('forwards a log from any logger implementation, and only once per call', () => {
        const { moduleExports } = createLogModule();
        patchLog(moduleExports);

        // A custom adapter only implements `logWithLevel`; the derived methods come from the base class.
        class WinstonLikeAdapter extends moduleExports.BaseCrawleeLogger {}

        new WinstonLikeAdapter().warning('from a custom adapter');
        // `warningOnce` routes through `warning`, so it must not emit twice.
        new WinstonLikeAdapter().warningOnce('once');

        const records = logExporter.getFinishedLogRecords();
        expect(records.map((r) => r.body)).toEqual(['from a custom adapter', 'once']);
        expect(records.every((r) => r.severityNumber === SeverityNumber.WARN)).toBe(true);
    });

    test('maps an exception onto the semantic convention attributes', () => {
        const { moduleExports } = createLogModule();
        patchLog(moduleExports);

        const error = new TypeError('boom');
        new moduleExports.BaseCrawleeLogger().exception(error, 'failed');

        const record = logExporter.getFinishedLogRecords()[0] as LogRecord;
        expect(record.severityNumber).toBe(SeverityNumber.ERROR);
        expect(record.attributes[ATTR_EXCEPTION_TYPE]).toBe('TypeError');
        expect(record.attributes[ATTR_EXCEPTION_MESSAGE]).toBe('boom');
        expect(record.attributes[ATTR_EXCEPTION_STACKTRACE]).toContain('TypeError: boom');
    });
});

/**
 * An instrumentation must not be able to change the behaviour of the code it patches. Everything the instrumentation
 * itself does - reading the log arguments, emitting the record, resolving a user supplied span name or attributes -
 * runs inside the application's call path, so a failure in any of it has to stay contained.
 */
describe('telemetry failures are contained', () => {
    let provider: NodeTracerProvider;
    let exporter: InMemorySpanExporter;
    let processor: SimpleSpanProcessor;

    beforeAll(() => {
        exporter = new InMemorySpanExporter();
        processor = new SimpleSpanProcessor(exporter);
        provider = new NodeTracerProvider({ spanProcessors: [processor] });
    });

    beforeEach(() => exporter.reset());

    afterAll(async () => {
        await provider.shutdown();
    });

    /** A logger provider whose records never make it out, standing in for a throwing log record processor. */
    const explodingLoggerProvider = {
        getLogger: () => ({
            emit: () => {
                throw new Error('log record processor exploded');
            },
        }),
    } as unknown as LoggerProvider;

    function patchLogger(loggerProvider: LoggerProvider) {
        const calls: unknown[][] = [];

        class BaseCrawleeLogger {
            logWithLevel(...args: unknown[]): void {
                calls.push(args);
            }

            info(message: unknown, data?: Record<string, unknown>) {
                this.logWithLevel(4, message, data);
            }
        }

        const instrumentation = new CrawleeInstrumentation({ requestHandlingInstrumentation: false });
        instrumentation.setLoggerProvider(loggerProvider);
        const definition = (instrumentation as any).init().find((d: any) => d.name === '@crawlee/core') as {
            patch: (e: any) => any;
        };
        definition.patch({ BaseCrawleeLogger });

        return { logger: new BaseCrawleeLogger(), calls };
    }

    test('a throwing log pipeline does not swallow the application log call', () => {
        const { logger, calls } = patchLogger(explodingLoggerProvider);

        expect(() => logger.info('hello', { foo: 'bar' })).not.toThrow();
        expect(calls).toEqual([[4, 'hello', { foo: 'bar' }]]);
    });

    test('a message that cannot be stringified does not swallow the application log call', () => {
        const { logger, calls } = patchLogger(
            new LoggerProvider({ processors: [new SimpleLogRecordProcessor(new InMemoryLogRecordExporter())] }),
        );
        const hostile = {
            toString() {
                throw new Error('nope');
            },
        };

        expect(() => logger.info(hostile)).not.toThrow();
        expect(calls).toEqual([[4, hostile, undefined]]);
    });

    function patchWithFailingHook(hook: 'spanName' | 'spanOptions') {
        class BasicCrawler {
            async handleRequest() {
                return 'done';
            }
        }

        const instrumentation = new CrawleeInstrumentation({
            requestHandlingInstrumentation: false,
            logInstrumentation: false,
            customInstrumentation: [
                {
                    moduleName: '@crawlee/basic',
                    className: 'BasicCrawler',
                    methodName: 'handleRequest',
                    spanName: 'crawlee.crawler.handleRequest',
                    [hook]: () => {
                        throw new Error(`${hook} exploded`);
                    },
                },
            ],
        });
        instrumentation.setTracerProvider(provider);
        const definition = (instrumentation as any).init().find((d: any) => d.name === '@crawlee/basic') as {
            patch: (e: any) => any;
        };
        definition.patch({ BasicCrawler });

        return new BasicCrawler();
    }

    test('a throwing spanName callback does not break the patched method', async () => {
        await expect(patchWithFailingHook('spanName').handleRequest()).resolves.toBe('done');

        await processor.forceFlush();
        // The span is still recorded, under the method's default name.
        expect(exporter.getFinishedSpans().map((s: ReadableSpan) => s.name)).toEqual(['BasicCrawler.handleRequest']);
    });

    test('a throwing spanOptions callback does not break the patched method', async () => {
        await expect(patchWithFailingHook('spanOptions').handleRequest()).resolves.toBe('done');

        await processor.forceFlush();
        const spans = exporter.getFinishedSpans();
        expect(spans.map((s: ReadableSpan) => s.name)).toEqual(['crawlee.crawler.handleRequest']);
        // The attributes the instrumentation itself adds are unaffected by the failing callback.
        expect(spans[0].attributes).toEqual({ [ATTR_CODE_FUNCTION_NAME]: 'BasicCrawler.handleRequest' });
    });
});

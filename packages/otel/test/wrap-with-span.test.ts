import { wrapWithSpan } from '@crawlee/otel';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

describe('wrapWithSpan', () => {
    let provider: NodeTracerProvider;
    let exporter: InMemorySpanExporter;
    let processor: SimpleSpanProcessor;

    beforeAll(() => {
        exporter = new InMemorySpanExporter();
        processor = new SimpleSpanProcessor(exporter);
        provider = new NodeTracerProvider({
            spanProcessors: [processor],
        });
        provider.register();
    });

    beforeEach(() => {
        exporter.reset();
    });

    afterAll(async () => {
        await provider.shutdown();
    });

    describe('basic functionality', () => {
        test('wraps a sync function and creates a span', async () => {
            const fn = vi.fn(() => 'result');
            const wrapped = wrapWithSpan(fn, { spanName: 'test-span' });

            const result = await wrapped();

            await processor.forceFlush();

            expect(result).toBe('result');
            expect(fn).toHaveBeenCalledOnce();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('test-span');
            expect(spans[0].status.code).toBe(SpanStatusCode.OK);
        });

        test('wraps an async function and creates a span', async () => {
            const fn = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return 'async-result';
            });
            const wrapped = wrapWithSpan(fn, { spanName: 'async-span' });

            const result = await wrapped();

            await processor.forceFlush();

            expect(result).toBe('async-result');
            expect(fn).toHaveBeenCalledOnce();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('async-span');
            expect(spans[0].status.code).toBe(SpanStatusCode.OK);
        });

        test('passes arguments to the wrapped function', async () => {
            const fn = vi.fn((a: number, b: string) => `${a}-${b}`);
            const wrapped = wrapWithSpan(fn, { spanName: 'args-span' });

            const result = await wrapped(42, 'hello');

            expect(result).toBe('42-hello');
            expect(fn).toHaveBeenCalledWith(42, 'hello');
        });

        test('uses function name as span name when no spanName provided', async () => {
            function namedFunction() {
                return 'named';
            }
            const wrapped = wrapWithSpan(namedFunction);

            // wrapWithSpan always returns a Promise at runtime
            await Promise.resolve(wrapped());
            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('namedFunction');
        });

        test('uses "anonymous" as span name for anonymous functions without spanName', async () => {
            const wrapped = wrapWithSpan(() => 'anon');

            // wrapWithSpan always returns a Promise at runtime
            await Promise.resolve(wrapped());
            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('anonymous');
        });
    });

    describe('error handling', () => {
        test('records exception and sets error status when function throws', async () => {
            const error = new Error('Test error');
            const fn = vi.fn(() => {
                throw error;
            });
            const wrapped = wrapWithSpan(fn, { spanName: 'error-span' });

            await expect(wrapped()).rejects.toThrow('Test error');

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('error-span');
            expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
            expect(spans[0].events).toHaveLength(1);
            expect(spans[0].events[0].name).toBe('exception');
        });

        test('records exception for async function rejection', async () => {
            const fn = vi.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                throw new Error('Async error');
            });
            const wrapped = wrapWithSpan(fn, { spanName: 'async-error-span' });

            await expect(wrapped()).rejects.toThrow('Async error');

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
        });
    });

    describe('dynamic span name', () => {
        test('supports function-based spanName', async () => {
            const fn = vi.fn((url: string) => `fetched: ${url}`);
            const wrapped = wrapWithSpan(fn, {
                spanName: (url: string) => `fetch ${url}`,
            });

            await wrapped('https://example.com');

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('fetch https://example.com');
        });

        test('spanName function receives all arguments', async () => {
            const fn = vi.fn((a: number, b: number) => a + b);
            const wrapped = wrapWithSpan(fn, {
                spanName: (a: number, b: number) => `add-${a}-${b}`,
            });

            await wrapped(1, 2);

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('add-1-2');
        });
    });

    describe('span options and attributes', () => {
        test('supports static spanOptions', async () => {
            const fn = vi.fn(() => 'result');
            const wrapped = wrapWithSpan(fn, {
                spanName: 'with-attrs',
                spanOptions: {
                    attributes: {
                        'custom.attr': 'value',
                        'custom.number': 42,
                    },
                },
            });

            await wrapped();

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].attributes['custom.attr']).toBe('value');
            expect(spans[0].attributes['custom.number']).toBe(42);
        });

        test('supports function-based spanOptions', async () => {
            interface Request {
                url: string;
                method: string;
            }

            const fn = vi.fn((req: Request) => `handled ${req.url}`);
            const wrapped = wrapWithSpan(fn, {
                spanName: 'dynamic-attrs',
                spanOptions: (req: Request) => ({
                    attributes: {
                        'request.url': req.url,
                        'request.method': req.method,
                    },
                }),
            });

            await wrapped({ url: 'https://example.com', method: 'GET' });

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].attributes['request.url']).toBe('https://example.com');
            expect(spans[0].attributes['request.method']).toBe('GET');
        });
    });

    describe('context propagation', () => {
        test('multiple wrapped calls create separate spans', async () => {
            const fn1 = vi.fn(() => 'result1');
            const fn2 = vi.fn(() => 'result2');
            const wrapped1 = wrapWithSpan(fn1, { spanName: 'span-1' });
            const wrapped2 = wrapWithSpan(fn2, { spanName: 'span-2' });

            await wrapped1();
            await wrapped2();

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(2);
            expect(spans.map((s) => s.name).sort()).toEqual(['span-1', 'span-2']);
        });

        test('concurrent wrapped calls each create their own span', async () => {
            const fn = vi.fn(async (id: number) => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return `result-${id}`;
            });

            const wrapped = wrapWithSpan(fn, {
                spanName: (id: number) => `concurrent-span-${id}`,
            });

            await Promise.all([wrapped(1), wrapped(2), wrapped(3)]);

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(3);
            expect(spans.map((s) => s.name).sort()).toEqual([
                'concurrent-span-1',
                'concurrent-span-2',
                'concurrent-span-3',
            ]);
        });

        test('nested wrapWithSpan creates multiple spans', async () => {
            const innerFn = vi.fn(() => 'inner');
            const wrappedInner = wrapWithSpan(innerFn, { spanName: 'inner-span' });

            const outerFn = vi.fn(async () => {
                return wrappedInner();
            });
            const wrappedOuter = wrapWithSpan(outerFn, { spanName: 'outer-span' });

            await wrappedOuter();

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(2);

            const innerSpan = spans.find((s: ReadableSpan) => s.name === 'inner-span');
            const outerSpan = spans.find((s: ReadableSpan) => s.name === 'outer-span');

            expect(innerSpan).toBeDefined();
            expect(outerSpan).toBeDefined();
        });
    });

    describe('custom tracer', () => {
        test('uses custom tracer when provided', async () => {
            const customTracer = trace.getTracer('custom-tracer', '1.0.0');
            const fn = vi.fn(() => 'result');
            const wrapped = wrapWithSpan(fn, {
                spanName: 'custom-tracer-span',
                tracer: customTracer,
            });

            await wrapped();

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            // Use instrumentationScope (newer SDK) or instrumentationLibrary (older SDK)
            const span = spans[0] as any;
            const scope = span.instrumentationScope ?? span.instrumentationLibrary;
            expect(scope.name).toBe('custom-tracer');
            expect(scope.version).toBe('1.0.0');
        });

        test('defaults to crawlee tracer', async () => {
            const fn = vi.fn(() => 'result');
            const wrapped = wrapWithSpan(fn);

            await wrapped();

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            // Use instrumentationScope (newer SDK) or instrumentationLibrary (older SDK)
            const span = spans[0] as any;
            const scope = span.instrumentationScope ?? span.instrumentationLibrary;
            expect(scope.name).toBe('crawlee');
        });
    });

    describe('this context', () => {
        test('preserves this context for regular functions', async () => {
            const obj = {
                value: 42,
                getValue() {
                    return this.value;
                },
            };

            const wrapped = wrapWithSpan(obj.getValue, { spanName: 'this-span' });
            // wrapWithSpan always returns a Promise at runtime
            const result = await Promise.resolve(wrapped.call(obj));

            expect(result).toBe(42);
        });

        test('spanName function receives this context', async () => {
            const obj = {
                name: 'TestObject',
                doSomething() {
                    return 'done';
                },
            };

            const wrapped = wrapWithSpan(obj.doSomething, {
                spanName(this: typeof obj) {
                    return `span-for-${this.name}`;
                },
            });

            // wrapWithSpan always returns a Promise at runtime
            await Promise.resolve(wrapped.call(obj));

            await processor.forceFlush();

            const spans = exporter.getFinishedSpans();
            expect(spans).toHaveLength(1);
            expect(spans[0].name).toBe('span-for-TestObject');
        });
    });
});

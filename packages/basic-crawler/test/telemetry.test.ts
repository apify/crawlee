import * as otelApi from '@opentelemetry/api';

import type { Log } from '@apify/log';
import log from '@apify/log';

import { MemoryStorageEmulator } from '../../../test/shared/MemoryStorageEmulator';
import { BasicCrawler, RequestList } from '../src/index';

const localStorageEmulator = new MemoryStorageEmulator();

beforeEach(async () => {
    await localStorageEmulator.init();
});

afterAll(async () => {
    await localStorageEmulator.destroy();
});

describe('BasicCrawler Telemetry', () => {
    let requestList: RequestList;
    let testLogger: Log;

    beforeEach(async () => {
        requestList = await RequestList.open(null, ['https://example.com']);
        testLogger = log.child({ prefix: 'BasicCrawler' });
    });

    describe('withSpan', () => {
        it('should not create spans when telemetry is disabled', async () => {
            const tracerMock = {
                startActiveSpan: vitest.fn(),
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: false,
                requestHandler: async () => {},
            });

            // Access protected withSpan method
            // eslint-disable-next-line dot-notation
            const result = await crawler['withSpan']('test.span', {}, async () => 'result');

            expect(result).toBe('result');
            expect(tracerMock.startActiveSpan).not.toHaveBeenCalled();
        });

        it('should create spans when telemetry is enabled', async () => {
            const mockSpan = {
                end: vitest.fn(),
            };

            const tracerMock = {
                startActiveSpan: vitest.fn((name, options, fn) => fn(mockSpan)),
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                requestHandler: async () => {},
            });

            // Access protected withSpan method
            // eslint-disable-next-line dot-notation
            const result = await crawler['withSpan'](
                'test.span',
                { attributes: { key: 'value' } },
                async () => 'result',
            );

            expect(result).toBe('result');
            expect(tracerMock.startActiveSpan).toHaveBeenCalledWith(
                'test.span',
                { attributes: { key: 'value' } },
                expect.any(Function),
            );
            expect(mockSpan.end).toHaveBeenCalled();
        });

        it('should end span even if function throws', async () => {
            const mockSpan = {
                end: vitest.fn(),
            };

            const tracerMock = {
                startActiveSpan: vitest.fn((name, options, fn) => fn(mockSpan)),
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                requestHandler: async () => {},
            });

            // Access protected withSpan method
            await expect(
                // eslint-disable-next-line dot-notation
                crawler['withSpan']('test.span', {}, async () => {
                    throw new Error('Test error');
                }),
            ).rejects.toThrow('Test error');

            expect(mockSpan.end).toHaveBeenCalled();
        });
    });

    describe('wrapLogWithTracing', () => {
        it('should not wrap log when telemetry is disabled', async () => {
            const internalSpy = vitest.spyOn(testLogger, 'internal');

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: false,
                collectLogs: false,
                requestHandler: async () => {},
            });

            testLogger.info('test message');

            // Log should work normally without span recording
            expect(internalSpy).toHaveBeenCalled();
            expect(crawler).toBeDefined();
        });

        it('should wrap log when telemetry and collectLogs are enabled', async () => {
            const mockSpan = {
                isRecording: vitest.fn().mockReturnValue(true),
                addEvent: vitest.fn(),
                recordException: vitest.fn(),
            };

            vitest.spyOn(otelApi.trace, 'getSpan').mockReturnValue(mockSpan as unknown as otelApi.Span);

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                collectLogs: true,
                requestHandler: async () => {},
            });

            // Trigger a log within an active span context
            testLogger.info('test message', { data: 'value' });

            expect(crawler).toBeDefined();
            // The actual behavior depends on whether there's an active span
        });

        it('should not collect logs when only telemetry is enabled without collectLogs', async () => {
            const mockSpan = {
                isRecording: vitest.fn().mockReturnValue(true),
                addEvent: vitest.fn(),
                recordException: vitest.fn(),
            };

            vitest.spyOn(otelApi.trace, 'getSpan').mockReturnValue(mockSpan as unknown as otelApi.Span);

            // Reset log internal spy after any previous wrapping
            const originalInternal = Object.getPrototypeOf(testLogger).internal;

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                collectLogs: false,
                requestHandler: async () => {},
            });

            expect(crawler).toBeDefined();
            expect(originalInternal).toBeDefined();
        });

        it('should only wrap Log prototype once even with multiple crawler instances', async () => {
            const mockSpan = {
                isRecording: vitest.fn().mockReturnValue(true),
                addEvent: vitest.fn(),
                recordException: vitest.fn(),
            };

            vitest.spyOn(otelApi.trace, 'getSpan').mockReturnValue(mockSpan as unknown as otelApi.Span);

            const requestList1 = await RequestList.open(null, ['https://example1.com']);
            const requestList2 = await RequestList.open(null, ['https://example2.com']);

            const crawler1 = new BasicCrawler({
                requestList: requestList1,
                log: testLogger,
                enableTelemetry: true,
                collectLogs: true,
                requestHandler: async () => {},
            });

            const crawler2 = new BasicCrawler({
                requestList: requestList2,
                log: testLogger,
                enableTelemetry: true,
                collectLogs: true,
                requestHandler: async () => {},
            });

            expect(crawler1).toBeDefined();
            expect(crawler2).toBeDefined();

            // The WRAPPED symbol should be set, preventing double wrapping
            const LogProto = Object.getPrototypeOf(testLogger);
            const WRAPPED = Symbol.for('otel.log.internal.patched');
            expect(LogProto[WRAPPED]).toBe(true);
        });
    });

    describe('run() span', () => {
        it('should create a crawlee.crawler.run span when telemetry is enabled', async () => {
            const mockSpan = {
                end: vitest.fn(),
            };

            const startActiveSpanMock = vitest.fn((name, options, fn) => fn(mockSpan));
            const tracerMock = {
                startActiveSpan: startActiveSpanMock,
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                requestHandler: async () => {},
            });

            await crawler.run();

            expect(startActiveSpanMock).toHaveBeenCalledWith(
                'crawlee.crawler.run',
                expect.objectContaining({
                    attributes: expect.objectContaining({
                        'crawlee.crawler.type': 'BasicCrawler',
                    }),
                }),
                expect.any(Function),
            );
        });
    });

    describe('telemetry option', () => {
        it('should default to telemetry disabled', () => {
            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                requestHandler: async () => {},
            });

            // eslint-disable-next-line dot-notation
            expect(crawler['telemetry']).toBe(false);
        });

        it('should enable telemetry when explicitly set', () => {
            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                requestHandler: async () => {},
            });

            // eslint-disable-next-line dot-notation
            expect(crawler['telemetry']).toBe(true);
        });
    });

    describe('_executeHooks with spans', () => {
        it('should create spans for hooks when telemetry is enabled', async () => {
            const mockSpan = {
                end: vitest.fn(),
            };

            const startActiveSpanMock = vitest.fn((name, options, fn) => fn(mockSpan));
            const tracerMock = {
                startActiveSpan: startActiveSpanMock,
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const hook1 = vitest.fn();
            const hook2 = vitest.fn();

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: true,
                requestHandler: async () => {},
            });

            // Access protected _executeHooks method
            // eslint-disable-next-line dot-notation
            await crawler['_executeHooks']([hook1, hook2], {} as any);

            // Should create spans for each hook
            expect(startActiveSpanMock).toHaveBeenCalledWith(
                'crawlee.hook',
                expect.objectContaining({ attributes: { 'crawlee.hook.index': 0 } }),
                expect.any(Function),
            );
            expect(startActiveSpanMock).toHaveBeenCalledWith(
                'crawlee.hook',
                expect.objectContaining({ attributes: { 'crawlee.hook.index': 1 } }),
                expect.any(Function),
            );
            expect(hook1).toHaveBeenCalled();
            expect(hook2).toHaveBeenCalled();
        });

        it('should not create hook spans when telemetry is disabled', async () => {
            const tracerMock = {
                startActiveSpan: vitest.fn(),
            };

            vitest.spyOn(otelApi.trace, 'getTracer').mockReturnValue(tracerMock as unknown as otelApi.Tracer);

            const hook = vitest.fn();

            const crawler = new BasicCrawler({
                requestList,
                log: testLogger,
                enableTelemetry: false,
                requestHandler: async () => {},
            });

            // eslint-disable-next-line dot-notation
            await crawler['_executeHooks']([hook], {} as any);

            expect(tracerMock.startActiveSpan).not.toHaveBeenCalled();
            expect(hook).toHaveBeenCalled();
        });
    });
});

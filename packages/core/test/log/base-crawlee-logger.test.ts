import type { CrawleeLogger, CrawleeLoggerOptions } from '../../src/log.js';
import { BaseCrawleeLogger, LogLevel } from '../../src/log.js';

/** Minimal concrete implementation for testing. */
class TestLogger extends BaseCrawleeLogger {
    logWithLevel(_level: number, _message: string, _data?: Record<string, unknown>): void {
        // Captured via vitest.spyOn in tests.
    }

    protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new TestLogger({ ...this.getOptions(), ...options });
    }
}

function makeLogger(options: Partial<CrawleeLoggerOptions> = {}) {
    const logger = new TestLogger(options);
    const spy = vitest.spyOn(logger, 'logWithLevel');
    return { logger, spy };
}

describe('BaseCrawleeLogger', () => {
    describe('getOptions / setOptions', () => {
        test('returns options passed to constructor', () => {
            const { logger } = makeLogger({ prefix: 'Test' });
            expect(logger.getOptions()).toMatchObject({ prefix: 'Test' });
        });

        test('setOptions overwrites prefix', () => {
            const { logger } = makeLogger({ prefix: 'Test' });
            logger.setOptions({ prefix: 'Updated' });
            expect(logger.getOptions().prefix).toBe('Updated');
        });
    });

    describe('error()', () => {
        test('calls logWithLevel with ERROR level and message', () => {
            const { logger, spy } = makeLogger();
            logger.error('something broke');
            expect(spy).toHaveBeenCalledWith(LogLevel.ERROR, 'something broke', undefined);
        });

        test('passes data through', () => {
            const { logger, spy } = makeLogger();
            logger.error('oops', { code: 42 });
            expect(spy).toHaveBeenCalledWith(LogLevel.ERROR, 'oops', { code: 42 });
        });
    });

    describe('exception()', () => {
        test('logs at ERROR level with combined message', () => {
            const { logger, spy } = makeLogger();
            const err = new Error('disk full');
            logger.exception(err, 'Save failed');
            expect(spy).toHaveBeenCalledWith(
                LogLevel.ERROR,
                'Save failed: disk full',
                expect.objectContaining({ stack: err.stack }),
            );
        });

        test('merges extra data alongside stack', () => {
            const { logger, spy } = makeLogger();
            const err = new Error('timeout');
            logger.exception(err, 'Request failed', { url: 'https://example.com' });
            expect(spy).toHaveBeenCalledWith(
                LogLevel.ERROR,
                'Request failed: timeout',
                expect.objectContaining({ url: 'https://example.com', stack: err.stack }),
            );
        });
    });

    describe('softFail()', () => {
        test('calls logWithLevel with SOFT_FAIL level', () => {
            const { logger, spy } = makeLogger();
            logger.softFail('non-critical');
            expect(spy).toHaveBeenCalledWith(LogLevel.SOFT_FAIL, 'non-critical', undefined);
        });
    });

    describe('warningOnce()', () => {
        test('logs the first occurrence', () => {
            const { logger, spy } = makeLogger();
            logger.warningOnce('only once');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('suppresses subsequent identical messages', () => {
            const { logger, spy } = makeLogger();
            logger.warningOnce('only once');
            logger.warningOnce('only once');
            logger.warningOnce('only once');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('treats different messages independently', () => {
            const { logger, spy } = makeLogger();
            logger.warningOnce('message A');
            logger.warningOnce('message B');
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('perf()', () => {
        test('prepends [PERF] to the message', () => {
            const { logger, spy } = makeLogger();
            logger.perf('render took 20ms');
            expect(spy).toHaveBeenCalledWith(LogLevel.PERF, '[PERF] render took 20ms', undefined);
        });
    });

    describe('deprecated()', () => {
        test('logs with [DEPRECATED] prefix', () => {
            const { logger, spy } = makeLogger();
            logger.deprecated('use newFn() instead');
            expect(spy).toHaveBeenCalledWith(LogLevel.WARNING, '[DEPRECATED] use newFn() instead', undefined);
        });

        test('only logs once per message', () => {
            const { logger, spy } = makeLogger();
            logger.deprecated('use newFn() instead');
            logger.deprecated('use newFn() instead');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('different deprecated messages are each logged once', () => {
            const { logger, spy } = makeLogger();
            logger.deprecated('old api A');
            logger.deprecated('old api B');
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('logWithLevel()', () => {
        test('dispatches at the given level', () => {
            const { logger, spy } = makeLogger();
            logger.logWithLevel(LogLevel.WARNING, 'log warning');
            expect(spy).toHaveBeenCalledWith(LogLevel.WARNING, 'log warning');
        });

        test('passes data through', () => {
            const { logger, spy } = makeLogger();
            logger.logWithLevel(LogLevel.ERROR, 'log error', { key: 'val' });
            expect(spy).toHaveBeenCalledWith(LogLevel.ERROR, 'log error', { key: 'val' });
        });
    });

    describe('child()', () => {
        test('returns a new logger instance', () => {
            const { logger } = makeLogger();
            const child = logger.child({ prefix: 'Child' });
            expect(child).not.toBe(logger);
        });

        test('child inherits parent options', () => {
            const { logger } = makeLogger({ prefix: 'Parent' });
            const child = logger.child({ prefix: 'Child' }) as TestLogger;
            expect(child.getOptions()).toMatchObject({ prefix: 'Child' });
        });

        test('child has independent warningOnce deduplication', () => {
            const { logger } = makeLogger();
            const child = logger.child({ prefix: 'Child' }) as TestLogger;
            const childSpy = vitest.spyOn(child as TestLogger, 'logWithLevel');

            logger.warningOnce('shared warning');

            // Child hasn't logged it yet — should log independently
            child.warningOnce('shared warning');
            expect(childSpy).toHaveBeenCalledOnce();
        });
    });
});

import type { CrawleeLogger, CrawleeLoggerOptions } from '../../src/log.js';
import { BaseCrawleeLogger, CrawleeLogLevel } from '../../src/log.js';

/** Minimal concrete implementation for testing. */
class TestLogger extends BaseCrawleeLogger {
    protected _log(_level: number, _message: string, _data?: Record<string, any> | null): void {
        // Captured via vitest.spyOn in tests.
    }

    protected _createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new TestLogger({ ...this.getOptions(), ...options });
    }
}

function makeLogger(options: Partial<CrawleeLoggerOptions> = {}) {
    const logger = new TestLogger(options);
    const spy = vitest.spyOn(logger, '_log' as any);
    return { logger, spy };
}

describe('BaseCrawleeLogger', () => {
    describe('getLevel / setLevel', () => {
        test('defaults to INFO', () => {
            const { logger } = makeLogger();
            expect(logger.getLevel()).toBe(CrawleeLogLevel.INFO);
        });

        test('respects level passed to constructor', () => {
            const { logger } = makeLogger({ level: CrawleeLogLevel.DEBUG });
            expect(logger.getLevel()).toBe(CrawleeLogLevel.DEBUG);
        });

        test('setLevel updates the threshold', () => {
            const { logger } = makeLogger();
            logger.setLevel(CrawleeLogLevel.ERROR);
            expect(logger.getLevel()).toBe(CrawleeLogLevel.ERROR);
        });
    });

    describe('getOptions / setOptions', () => {
        test('returns options passed to constructor', () => {
            const { logger } = makeLogger({ prefix: 'Test', maxDepth: 3 });
            expect(logger.getOptions()).toMatchObject({ prefix: 'Test', maxDepth: 3 });
        });

        test('setOptions merges without losing existing keys', () => {
            const { logger } = makeLogger({ prefix: 'Test' });
            logger.setOptions({ maxDepth: 5 });
            expect(logger.getOptions()).toMatchObject({ prefix: 'Test', maxDepth: 5 });
        });

        test('setOptions overwrites existing keys', () => {
            const { logger } = makeLogger({ prefix: 'Old' });
            logger.setOptions({ prefix: 'New' });
            expect(logger.getOptions().prefix).toBe('New');
        });
    });

    describe('level filtering', () => {
        test('logs ERROR when level is INFO', () => {
            const { logger, spy } = makeLogger();
            logger.error('oops');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('logs WARNING when level is INFO', () => {
            const { logger, spy } = makeLogger();
            logger.warning('careful');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('logs INFO when level is INFO', () => {
            const { logger, spy } = makeLogger();
            logger.info('hello');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('suppresses DEBUG when level is INFO', () => {
            const { logger, spy } = makeLogger();
            logger.debug('verbose');
            expect(spy).not.toHaveBeenCalled();
        });

        test('suppresses PERF when level is INFO', () => {
            const { logger, spy } = makeLogger();
            logger.perf('timing');
            expect(spy).not.toHaveBeenCalled();
        });

        test('logs DEBUG after setLevel(DEBUG)', () => {
            const { logger, spy } = makeLogger();
            logger.setLevel(CrawleeLogLevel.DEBUG);
            logger.debug('now visible');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('suppresses everything except ERROR when level is ERROR', () => {
            const { logger, spy } = makeLogger({ level: CrawleeLogLevel.ERROR });
            logger.warning('quiet');
            logger.info('quiet');
            logger.debug('quiet');
            expect(spy).not.toHaveBeenCalled();

            logger.error('loud');
            expect(spy).toHaveBeenCalledOnce();
        });

        test('suppresses all messages when level is OFF', () => {
            const { logger, spy } = makeLogger({ level: CrawleeLogLevel.OFF });
            logger.error('silent');
            logger.warning('silent');
            logger.info('silent');
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('error()', () => {
        test('calls _log with ERROR level and message', () => {
            const { logger, spy } = makeLogger();
            logger.error('something broke');
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.ERROR, 'something broke', undefined);
        });

        test('passes data through', () => {
            const { logger, spy } = makeLogger();
            logger.error('oops', { code: 42 });
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.ERROR, 'oops', { code: 42 });
        });
    });

    describe('exception()', () => {
        test('logs at ERROR level with combined message', () => {
            const { logger, spy } = makeLogger();
            const err = new Error('disk full');
            logger.exception(err, 'Save failed');
            expect(spy).toHaveBeenCalledWith(
                CrawleeLogLevel.ERROR,
                'Save failed: disk full',
                expect.objectContaining({ stack: err.stack }),
            );
        });

        test('merges extra data alongside stack', () => {
            const { logger, spy } = makeLogger();
            const err = new Error('timeout');
            logger.exception(err, 'Request failed', { url: 'https://example.com' });
            expect(spy).toHaveBeenCalledWith(
                CrawleeLogLevel.ERROR,
                'Request failed: timeout',
                expect.objectContaining({ url: 'https://example.com', stack: err.stack }),
            );
        });
    });

    describe('softFail()', () => {
        test('calls _log with SOFT_FAIL level', () => {
            const { logger, spy } = makeLogger();
            logger.softFail('non-critical');
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.SOFT_FAIL, 'non-critical', undefined);
        });

        test('suppressed when level is ERROR', () => {
            const { logger, spy } = makeLogger({ level: CrawleeLogLevel.ERROR });
            logger.softFail('ignored');
            expect(spy).not.toHaveBeenCalled();
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
            const { logger, spy } = makeLogger({ level: CrawleeLogLevel.PERF });
            logger.perf('render took 20ms');
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.PERF, '[PERF] render took 20ms', undefined);
        });

        test('suppressed at default INFO level', () => {
            const { logger, spy } = makeLogger();
            logger.perf('render took 20ms');
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('deprecated()', () => {
        test('logs with [DEPRECATED] prefix', () => {
            const { logger, spy } = makeLogger();
            logger.deprecated('use newFn() instead');
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.WARNING, '[DEPRECATED] use newFn() instead', undefined);
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

    describe('internal()', () => {
        test('dispatches at the given level', () => {
            const { logger, spy } = makeLogger();
            logger.internal(CrawleeLogLevel.WARNING, 'internal warning');
            expect(spy).toHaveBeenCalledWith(CrawleeLogLevel.WARNING, 'internal warning', expect.any(Object));
        });

        test('includes exception in data when provided', () => {
            const { logger, spy } = makeLogger();
            const err = new Error('boom');
            logger.internal(CrawleeLogLevel.ERROR, 'internal error', {}, err);
            expect(spy).toHaveBeenCalledWith(
                CrawleeLogLevel.ERROR,
                'internal error',
                expect.objectContaining({ exception: err }),
            );
        });

        test('is suppressed when level is below threshold', () => {
            const { logger, spy } = makeLogger({ level: CrawleeLogLevel.ERROR });
            logger.internal(CrawleeLogLevel.DEBUG, 'suppressed');
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('child()', () => {
        test('returns a new logger instance', () => {
            const { logger } = makeLogger();
            const child = logger.child({ prefix: 'Child' });
            expect(child).not.toBe(logger);
        });

        test('child inherits parent options', () => {
            const { logger } = makeLogger({ prefix: 'Parent', maxDepth: 3 });
            const child = logger.child({ prefix: 'Child' }) as TestLogger;
            expect(child.getOptions()).toMatchObject({ maxDepth: 3, prefix: 'Child' });
        });

        test('child has independent warningOnce deduplication', () => {
            const { logger } = makeLogger();
            const child = logger.child({ prefix: 'Child' }) as TestLogger;
            const childSpy = vitest.spyOn(child, '_log' as any);

            logger.warningOnce('shared warning');

            // Child hasn't logged it yet — should log independently
            child.warningOnce('shared warning');
            expect(childSpy).toHaveBeenCalledOnce();
        });

        test('child level changes do not affect parent', () => {
            const { logger, spy } = makeLogger();
            const child = logger.child({}) as TestLogger;
            child.setLevel(CrawleeLogLevel.OFF);

            logger.info('parent still logs');
            expect(spy).toHaveBeenCalledOnce();
        });
    });
});

import { _resetBunWarning, isBunRuntime, warnIfBunRuntime } from '@crawlee/utils';

afterEach(() => {
    _resetBunWarning();
    delete (globalThis as any).Bun;
});

describe('isBunRuntime', () => {
    test('returns false when Bun global is not present', () => {
        delete (globalThis as any).Bun;
        expect(isBunRuntime()).toBe(false);
    });

    test('returns true when Bun global is present', () => {
        (globalThis as any).Bun = { version: '1.0.0' };
        expect(isBunRuntime()).toBe(true);
    });
});

describe('warnIfBunRuntime', () => {
    test('does nothing when not running under Bun', () => {
        delete (globalThis as any).Bun;
        const logger = { warning: vitest.fn() };
        warnIfBunRuntime(logger);
        expect(logger.warning).not.toHaveBeenCalled();
    });

    test('calls logger.warning when running under Bun', () => {
        (globalThis as any).Bun = { version: '1.0.0' };
        const logger = { warning: vitest.fn() };
        warnIfBunRuntime(logger);
        expect(logger.warning).toHaveBeenCalledTimes(1);
        expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('ImpitHttpClient'));
    });

    test('only warns once even if called multiple times', () => {
        (globalThis as any).Bun = { version: '1.0.0' };
        const logger = { warning: vitest.fn() };
        warnIfBunRuntime(logger);
        warnIfBunRuntime(logger);
        warnIfBunRuntime(logger);
        expect(logger.warning).toHaveBeenCalledTimes(1);
    });

    test('falls back to console.warn when no logger is provided', () => {
        (globalThis as any).Bun = { version: '1.0.0' };
        const spy = vitest.spyOn(console, 'warn').mockImplementation(() => {});
        warnIfBunRuntime();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('ImpitHttpClient'));
    });
});

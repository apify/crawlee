import type { CrawlingContext } from '@crawlee/core';
import { ErrorTracker } from '@crawlee/core';
import { describe, expect, test, vitest } from 'vitest';

// `ErrorSnapshotter` is a module-internal collaborator of `ErrorTracker`; it is exercised
// through the only public entry point that reaches it - `new ErrorTracker({ saveErrorSnapshots: true })`.
describe('error snapshotter', () => {
    // All grouping disabled, so the captured snapshot URLs land directly on `tracker.result`.
    const newTracker = () =>
        new ErrorTracker({
            saveErrorSnapshots: true,
            showStackTrace: false,
            showErrorCode: false,
            showErrorName: false,
            showErrorMessage: false,
        });

    const contextWithStore = (keyValueStore: unknown) =>
        ({
            body: '<html></html>',
            getKeyValueStore: async () => keyValueStore,
        }) as unknown as CrawlingContext;

    test('stores the HTML snapshot under the record key it resolves the public URL for', async () => {
        const setValue = vitest.fn(async () => {});
        const getPublicUrl = vitest.fn(async (key: string) => `https://example.com/${key}`);
        const tracker = newTracker();

        await tracker.addAsync(new Error('some error'), contextWithStore({ setValue, getPublicUrl }));

        expect(setValue).toHaveBeenCalledTimes(1);
        const [key, value, options] = setValue.mock.calls[0] as unknown as [string, string, unknown];
        expect(key).toMatch(/^ERROR_SNAPSHOT/);
        expect(value).toBe('<html></html>');
        expect(options).toEqual({ contentType: 'text/html' });
        // The public URL must be resolved for the actual record key (no appended extension).
        expect(getPublicUrl).toHaveBeenCalledWith(key);
        expect(tracker.result.firstErrorHtmlUrl).toBe(`https://example.com/${key}`);
    });

    test('records no snapshot URL when storing fails', async () => {
        const getPublicUrl = vitest.fn(async (key: string) => `https://example.com/${key}`);
        const tracker = newTracker();

        await tracker.addAsync(
            new Error('some error'),
            contextWithStore({
                setValue: async () => {
                    throw new Error('nope');
                },
                getPublicUrl,
            }),
        );

        expect(getPublicUrl).not.toHaveBeenCalled();
        expect(tracker.result.firstErrorHtmlUrl).toBeUndefined();
    });
});

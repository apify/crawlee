import type { KeyValueStore } from '@crawlee/core';
import { ErrorSnapshotter } from '@crawlee/core';
import { describe, expect, test, vitest } from 'vitest';

describe('ErrorSnapshotter', () => {
    test('saveHTMLSnapshot returns the record key it stored the snapshot under', async () => {
        const snapshotter = new ErrorSnapshotter();
        const setValue = vitest.fn(async () => {});
        const keyValueStore = { setValue } as unknown as KeyValueStore;

        const key = await snapshotter.saveHTMLSnapshot('<html></html>', keyValueStore, 'ERROR_SNAPSHOT_foo');

        expect(setValue).toHaveBeenCalledWith('ERROR_SNAPSHOT_foo', '<html></html>', { contentType: 'text/html' });
        // The returned value must be the actual record key (no appended extension),
        // as it is fed to `keyValueStore.getPublicUrl()`.
        expect(key).toBe('ERROR_SNAPSHOT_foo');
    });

    test('saveHTMLSnapshot returns undefined when storing fails', async () => {
        const snapshotter = new ErrorSnapshotter();
        const keyValueStore = {
            setValue: async () => {
                throw new Error('nope');
            },
        } as unknown as KeyValueStore;

        await expect(snapshotter.saveHTMLSnapshot('<html></html>', keyValueStore, 'KEY')).resolves.toBeUndefined();
    });
});

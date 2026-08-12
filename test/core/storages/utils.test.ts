import type { Dictionary, StorageBackend } from '@crawlee/types';
import {
    Configuration,
    KeyValueStore,
    MemoryStorageBackend,
    purgeDefaultStorages,
    serviceLocator,
    useState,
} from '@crawlee/core';

describe('useState', () => {
    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
        serviceLocator.setConfiguration(new Configuration({ persistStateIntervalMillis: 1e3 }));
    });

    it('Should initialize with the provided value', async () => {
        const state = await useState('my-state', { hello: 'world' });

        expect(state).toHaveProperty('hello');
        expect(state).toEqual({ hello: 'world' });
    });

    it('Should auto-save the modified value', async () => {
        const state1 = await useState<Dictionary<any>>('my-state', { hello: 'world' });
        expect(state1).toEqual({ hello: 'world' });

        state1.hello = 'foo';
        state1.foo = ['fizz'];

        const state2 = await useState<Dictionary<any>>('my-state', { hello: 'world' });
        expect(state2).toEqual({ hello: 'foo', foo: ['fizz'] });

        state2.foo!.push('buzz');
        expect(state2).toEqual({ hello: 'foo', foo: ['fizz', 'buzz'] });
    });

    it('Should save the value to the default key-value store', async () => {
        const state = await useState<Dictionary<any>>('my-state', { hello: 'world' });
        expect(state).toEqual({ hello: 'world' });

        state.hello = 'foo';
        state.foo = ['fizz'];

        const manager = serviceLocator.getEventManager();

        await manager.init();

        await new Promise((resolve) => {
            manager.on('persistState', () => {
                resolve(true);
            });
        });

        const data = await KeyValueStore.getValue('my-state');

        expect(data).toHaveProperty('hello');
        expect(data).toHaveProperty('foo');

        await manager.close();
    });
});

describe('purgeDefaultStorages', () => {
    it('makes concurrent callers wait for an in-flight purge', async () => {
        let purging = false;
        let purgedWhileAlreadyPurging = false;

        const client = {
            async purge() {
                purging = true;
                await new Promise((resolve) => setTimeout(resolve, 50));
                purging = false;
            },
        } as unknown as StorageBackend;

        const config = new Configuration({ purgeOnStart: true });

        await Promise.all(
            Array.from({ length: 3 }, async () => {
                await purgeDefaultStorages({ onlyPurgeOnce: true, storageBackend: client, configuration: config });
                if (purging) {
                    purgedWhileAlreadyPurging = true;
                }
            }),
        );

        expect(purgedWhileAlreadyPurging).toBe(false);
    });
});

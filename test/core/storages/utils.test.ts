import { useState, KeyValueStore } from '@crawlee/core';
import type { Dictionary } from '@crawlee/core';
import { Configuration } from 'apify';
import { MemoryStorageEmulator } from 'test/shared/MemoryStorageEmulator';

describe('useState', () => {
    const emulator = new MemoryStorageEmulator();

    beforeAll(async () => {
        Configuration.getGlobalConfig().set('persistStateIntervalMillis', 1e3);
    });

    beforeEach(async () => {
        await emulator.init();
    });

    afterAll(async () => {
        await emulator.destroy();
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

        const manager = Configuration.globalConfig.getEventManager();

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

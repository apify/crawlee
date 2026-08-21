import { setTimeout as sleep } from 'node:timers/promises';

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
    EventType,
    KeyValueStore,
    MemoryStorageBackend,
    serviceLocator,
    StateValidationError,
} from '../../packages/core/src/index.js';
import { RecoverableState } from '../../packages/core/src/recoverable_state.js';

interface TestState {
    counter: number;
    message: string;
    data: { nested: string };
}

describe('RecoverableState', () => {
    beforeEach(async () => {
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    const defaultState: TestState = {
        counter: 0,
        message: 'hello',
        data: { nested: 'value' },
    };

    test('should initialize with default state when persistence is disabled', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        const state = await recoverableState.initialize();

        expect(state).toEqual(defaultState);
        expect(state).not.toBe(defaultState); // Should be a deep copy
        expect(recoverableState.currentValue).toEqual(defaultState);
    });

    test('should throw when accessing currentValue before it has been established', () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        expect(() => recoverableState.currentValue).toThrow('Recoverable state has not yet been loaded');
    });

    test('should establish a deep copy of the default state on a synchronous reset', () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        recoverableState.reset();

        expect(recoverableState.currentValue).toEqual(defaultState);
        expect(recoverableState.currentValue).not.toBe(defaultState);
    });

    test('should keep pre-initialization modifications when there is nothing to restore', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        recoverableState.reset();
        recoverableState.currentValue.counter = 42;
        await recoverableState.initialize();

        expect(recoverableState.currentValue.counter).toBe(42);
    });

    test('should overwrite a pre-initialization state with a restored record', async () => {
        await (await KeyValueStore.open()).setValue('test-key', { ...defaultState, counter: 7 });

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        recoverableState.reset();
        recoverableState.currentValue.counter = 42;

        expect((await recoverableState.initialize()).counter).toBe(7);
    });

    test('should allow state modification after initialization', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify the state
        recoverableState.currentValue.counter = 42;
        recoverableState.currentValue.message = 'modified';
        recoverableState.currentValue.data.nested = 'new value';

        expect(recoverableState.currentValue.counter).toBe(42);
        expect(recoverableState.currentValue.message).toBe('modified');
        expect(recoverableState.currentValue.data.nested).toBe('new value');
    });

    test('should reset state to default values', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify the state
        recoverableState.currentValue.counter = 42;
        recoverableState.currentValue.message = 'modified';

        recoverableState.reset();

        expect(recoverableState.currentValue).toEqual(defaultState);
        expect(recoverableState.currentValue).not.toBe(defaultState); // Should be a new copy
    });

    test('should handle teardown gracefully when persistence is disabled', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();
        await expect(recoverableState.teardown()).resolves.not.toThrow();
    });

    test('should start listening again when initialized after a teardown', async () => {
        const events = serviceLocator.getEventManager();

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        await recoverableState.initialize();
        expect(events.listenerCount(EventType.PERSIST_STATE)).toBe(1);

        await recoverableState.teardown();
        expect(events.listenerCount(EventType.PERSIST_STATE)).toBe(0);

        await recoverableState.initialize();
        expect(events.listenerCount(EventType.PERSIST_STATE)).toBe(1);

        await recoverableState.teardown();
    });

    test('should warn rather than throw when a periodic persist fails', async () => {
        const store = await KeyValueStore.open();
        vi.spyOn(store, 'setValue').mockRejectedValue(new Error('store is on fire'));

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
            keyValueStore: store,
        });

        await recoverableState.initialize();

        // An unhandled rejection here would take the process down and make `EventManager.close()` reject.
        serviceLocator.getEventManager().emit(EventType.PERSIST_STATE, { isMigrating: false });
        await expect(serviceLocator.getEventManager().waitForAllListenersToComplete()).resolves.not.toThrow();

        await expect(recoverableState.persistState()).rejects.toThrow('store is on fire');
    });

    test('should warn rather than throw when the persist during teardown fails', async () => {
        const store = await KeyValueStore.open();
        vi.spyOn(store, 'setValue').mockRejectedValue(new Error('store is on fire'));

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
            keyValueStore: store,
        });

        await recoverableState.initialize();

        // `BasicCrawler.run()` tears down in a `finally`, so a throw here would replace the crawl's own outcome.
        await expect(recoverableState.teardown()).resolves.not.toThrow();
    });

    test('should handle arrays and complex objects in deep copy', async () => {
        const stateWithArray = {
            items: [1, 2, { nested: 'value' }],
        };

        const recoverableState = new RecoverableState({
            defaultState: stateWithArray,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify array and nested object
        recoverableState.currentValue.items.push(4);
        (recoverableState.currentValue.items[2] as any).nested = 'modified';

        // Reset should restore original values
        recoverableState.reset();

        expect(recoverableState.currentValue.items).toEqual([1, 2, { nested: 'value' }]);
    });

    test('should preserve values that do not survive JSON in the default deep copy', async () => {
        const counts = new Map([['a', 1]]);

        const recoverableState = new RecoverableState({
            defaultState: {
                limit: Infinity,
                since: new Date('2020-01-01T00:00:00.000Z'),
                counts,
            },
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        const state = await recoverableState.initialize();

        expect(state.limit).toBe(Infinity);
        expect(state.since).toEqual(new Date('2020-01-01T00:00:00.000Z'));
        expect(state.counts).toEqual(counts);
        expect(state.counts).not.toBe(counts); // Should be a deep copy
    });

    test('should persist the state as JSON and restore it', async () => {
        const store = await KeyValueStore.open();

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        await recoverableState.initialize();
        recoverableState.currentValue.counter = 42;
        await recoverableState.persistState();

        const record = await store.getRecord('test-key');
        expect(record!.contentType).toMatch('application/json');
        expect(await store.getValue('test-key')).toEqual({ ...defaultState, counter: 42 });

        const restored = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        expect(await restored.initialize()).toEqual({ ...defaultState, counter: 42 });
    });

    test('should handle custom classes with serialize/deserialize', async () => {
        class CustomData {
            constructor(
                public value: string,
                public count: number,
            ) {}
        }

        const serialize = vi.fn((state: { data: CustomData; name: string }) => ({
            data: { value: state.data.value, count: state.data.count },
            name: state.name,
        }));

        const deserialize = vi.fn((persisted: { data: { value: string; count: number }; name: string }) => ({
            data: new CustomData(persisted.data.value, persisted.data.count),
            name: persisted.name,
        }));

        const build = () =>
            new RecoverableState({
                defaultState: () => ({ data: new CustomData('test', 42), name: 'example' }),
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                serialize,
                deserialize,
            });

        const recoverableState = build();
        await recoverableState.initialize();

        // With no record to load, the default comes from the factory - deserialize is not involved.
        expect(recoverableState.currentValue.data).toBeInstanceOf(CustomData);
        expect(recoverableState.currentValue.data.value).toBe('test');
        expect(recoverableState.currentValue.name).toBe('example');
        expect(deserialize).not.toHaveBeenCalled();

        recoverableState.currentValue.data.value = 'updated';
        await recoverableState.persistState();

        expect(serialize).toHaveBeenCalled();
        expect(await (await KeyValueStore.open()).getValue('test-key')).toMatchObject({
            data: { value: 'updated' },
        });

        const restored = build();
        await restored.initialize();

        expect(deserialize).toHaveBeenCalled();
        expect(restored.currentValue.data).toBeInstanceOf(CustomData);
        expect(restored.currentValue.data.value).toBe('updated');
    });

    test('should call a defaultState factory afresh for every reset', async () => {
        const defaultStateFactory = vi.fn(() => ({ items: new Map([['a', 1]]) }));

        const recoverableState = new RecoverableState({
            defaultState: defaultStateFactory,
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        recoverableState.reset();
        const first = recoverableState.currentValue.items;
        recoverableState.reset();

        expect(recoverableState.currentValue.items).toEqual(first);
        expect(recoverableState.currentValue.items).not.toBe(first);
        expect(defaultStateFactory).toHaveBeenCalledTimes(2);
    });

    test('should not let modifications of a restored state reach the persisted record', async () => {
        const store = await KeyValueStore.open();
        await store.setValue('test-key', { ...defaultState, counter: 42 });

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        await recoverableState.initialize();
        recoverableState.currentValue.data.nested = 'mutated';

        expect(await store.getValue('test-key')).toMatchObject({ data: { nested: 'value' } });
    });

    describe('schemas as conversions', () => {
        const stateSchema = z.object({ counter: z.number(), message: z.string() });

        test('should use the validated output of a deserialize schema', async () => {
            await (await KeyValueStore.open()).setValue('test-key', { counter: '42', message: 'hi', extra: 'nope' });

            const recoverableState = new RecoverableState({
                defaultState: { counter: 0, message: '' },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                // `z.coerce` and the stripping of undeclared keys are only visible if the validated output,
                // rather than the raw record, is what becomes the state.
                deserialize: z.object({ counter: z.coerce.number(), message: z.string() }),
            });

            expect(await recoverableState.initialize()).toEqual({ counter: 42, message: 'hi' });
        });

        test('should throw a StateValidationError on an invalid record', async () => {
            await (await KeyValueStore.open()).setValue('test-key', { counter: 'not a number', message: 'hi' });

            const recoverableState = new RecoverableState({
                defaultState: { counter: 0, message: '' },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                deserialize: stateSchema,
            });

            await expect(recoverableState.initialize()).rejects.toThrow(StateValidationError);
        });

        test('should stay usable and keep persisting after a caught validation error', async () => {
            const store = await KeyValueStore.open();
            await store.setValue('test-key', { counter: 'not a number', message: 'hi' });

            const recoverableState = new RecoverableState({
                defaultState: { counter: 0, message: '' },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                deserialize: stateSchema,
            });

            await expect(recoverableState.initialize()).rejects.toThrow(StateValidationError);

            expect(recoverableState.currentValue).toEqual({ counter: 0, message: '' });

            recoverableState.currentValue.counter = 1;
            await recoverableState.persistState();
            expect(await store.getValue('test-key')).toEqual({ counter: 1, message: '' });
        });

        test('should not run a deserialize schema when there is no record', async () => {
            const validate = vi.fn();

            const recoverableState = new RecoverableState({
                defaultState: { counter: 0 },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                deserialize: { '~standard': { version: 1, vendor: 'test', validate } },
            });

            await recoverableState.initialize();

            expect(validate).not.toHaveBeenCalled();
        });

        test('should validate on the way out when serialize is a schema', async () => {
            const recoverableState = new RecoverableState({
                defaultState: { counter: 0, message: '' },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                serialize: stateSchema,
            });

            await recoverableState.initialize();
            (recoverableState.currentValue as any).counter = 'not a number';

            await expect(recoverableState.persistState()).rejects.toThrow(StateValidationError);
        });

        test('should support an asynchronous schema', async () => {
            await (await KeyValueStore.open()).setValue('test-key', { counter: 7 });

            const recoverableState = new RecoverableState({
                defaultState: { counter: 0 },
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                deserialize: {
                    '~standard': {
                        version: 1,
                        vendor: 'test',
                        validate: async (value) => ({ value: value as { counter: number } }),
                    },
                },
            });

            expect(await recoverableState.initialize()).toEqual({ counter: 7 });
        });

        test('should accept a zod codec as deserialize, with encode as serialize', async () => {
            class Wrapped {
                constructor(readonly value: number) {}
            }

            const codec = z.codec(z.object({ counter: z.number() }), z.instanceof(Wrapped), {
                decode: ({ counter }) => new Wrapped(counter),
                encode: (wrapped) => ({ counter: wrapped.value }),
            });

            const store = await KeyValueStore.open();
            await store.setValue('test-key', { counter: 7 });

            const recoverableState = new RecoverableState({
                defaultState: () => new Wrapped(0),
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                deserialize: codec,
                serialize: (state) => codec.encode(state),
            });

            const loaded = await recoverableState.initialize();
            expect(loaded).toBeInstanceOf(Wrapped);
            expect(loaded.value).toBe(7);

            await recoverableState.persistState();
            expect(await store.getValue('test-key')).toEqual({ counter: 7 });
        });
    });

    describe('reset and resetStore', () => {
        test('reset should leave the persisted record alone', async () => {
            const store = await KeyValueStore.open();

            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
            });

            await recoverableState.initialize();
            recoverableState.currentValue.counter = 42;
            await recoverableState.persistState();

            recoverableState.reset();

            expect(recoverableState.currentValue.counter).toBe(0);
            expect(await store.getValue('test-key')).toMatchObject({ counter: 42 });
        });

        test('reset should be undone by the next initialize, unless the record is cleared too', async () => {
            const build = () =>
                new RecoverableState({
                    defaultState,
                    persistStateKey: 'test-key',
                    persistenceEnabled: true,
                });

            const first = build();
            await first.initialize();
            first.currentValue.counter = 42;
            await first.teardown();

            // Resetting in memory does not stop the record from coming back on the next load...
            first.reset();
            expect(await build().initialize()).toMatchObject({ counter: 42 });

            // ...clearing the record does.
            await first.resetStore();
            expect(await build().initialize()).toMatchObject({ counter: 0 });
        });

        test('resetStore should clear the record but leave the in-memory state alone', async () => {
            const store = await KeyValueStore.open();

            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
            });

            await recoverableState.initialize();
            recoverableState.currentValue.counter = 42;
            await recoverableState.teardown();

            await recoverableState.resetStore();

            expect(await store.getValue('test-key')).toBeNull();
            expect(recoverableState.currentValue.counter).toBe(42);
        });

        test('resetStore should throw while PERSIST_STATE events are still being handled', async () => {
            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
            });

            await recoverableState.initialize();

            await expect(recoverableState.resetStore()).rejects.toThrow('Use reset() to reset the state itself');

            await recoverableState.teardown();
            await expect(recoverableState.resetStore()).resolves.not.toThrow();
        });

        test('resetStore should be a no-op without a store', async () => {
            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
            });

            await expect(recoverableState.resetStore()).resolves.not.toThrow();
        });
    });

    test('persistState should be a no-op when there is no state to write', async () => {
        const store = await KeyValueStore.open();
        const setValue = vi.spyOn(store, 'setValue');

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
            keyValueStore: store,
        });

        await expect(recoverableState.persistState()).resolves.not.toThrow();
        expect(setValue).not.toHaveBeenCalled();
    });

    test('persistState should be a no-op before initialization', async () => {
        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
        });

        await expect(recoverableState.persistState()).resolves.not.toThrow();
        expect(await (await KeyValueStore.open()).getValue('test-key')).toBeNull();
    });

    describe('keyValueStore', () => {
        let namedStore: KeyValueStore;

        beforeEach(async () => {
            namedStore = await KeyValueStore.open({ name: 'named-store' });
        });

        const cases: [label: string, buildStore: () => KeyValueStore | PromiseLike<KeyValueStore>][] = [
            ['an open instance', () => namedStore],
            ['a pending open()', () => KeyValueStore.open({ name: 'named-store' })],
        ];

        test.for(cases)('should persist into the store given as %s', async ([, buildStore]) => {
            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                keyValueStore: buildStore(),
            });

            await recoverableState.initialize();
            recoverableState.currentValue.counter = 42;
            await recoverableState.persistState();

            expect(await namedStore.getValue('test-key')).toMatchObject({ counter: 42 });
            expect(await (await KeyValueStore.open()).getValue('test-key')).toBeNull();
        });

        test('should await a pending open() even without initialization', async () => {
            const recoverableState = new RecoverableState({
                defaultState,
                persistStateKey: 'test-key',
                persistenceEnabled: true,
                keyValueStore: KeyValueStore.open({ name: 'named-store' }),
            });

            recoverableState.reset();
            recoverableState.currentValue.counter = 42;
            await recoverableState.persistState();

            expect(await namedStore.getValue('test-key')).toMatchObject({ counter: 42 });
        });
    });

    test('should time out a persistence call that takes too long', async () => {
        const store = await KeyValueStore.open();
        vi.spyOn(store, 'setValue').mockImplementation(async () => sleep(1000));

        const recoverableState = new RecoverableState({
            defaultState,
            persistStateKey: 'test-key',
            persistenceEnabled: true,
            keyValueStore: store,
            persistenceTimeoutMillis: 50,
        });

        recoverableState.reset();

        await expect(recoverableState.persistState()).rejects.toThrow(/timed out after 0.05 seconds/);
    });
});

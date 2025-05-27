import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RecoverableState } from '../../packages/utils/src/internals/recoverable-state';
import { MemoryStorageEmulator } from '../shared/MemoryStorageEmulator';

interface TestState {
    counter: number;
    message: string;
    data: { nested: string };
}

describe('RecoverableState', () => {
    const localStorageEmulator = new MemoryStorageEmulator();

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterEach(async () => {
        await localStorageEmulator.destroy();
    });

    const defaultState: TestState = {
        counter: 0,
        message: 'hello',
        data: { nested: 'value' },
    };

    test('should initialize with default state when persistence is disabled', async () => {
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        const state = await recoverableState.initialize();

        expect(state).toEqual(defaultState);
        expect(state).not.toBe(defaultState); // Should be a deep copy
        expect(recoverableState.currentValue).toEqual(defaultState);
    });

    test('should throw error when accessing currentValue before initialization', () => {
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        expect(() => recoverableState.currentValue).toThrow('Recoverable state has not yet been loaded');
    });

    test('should allow state modification after initialization', async () => {
        const recoverableState = new RecoverableState(defaultState, {
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
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify the state
        recoverableState.currentValue.counter = 42;
        recoverableState.currentValue.message = 'modified';

        // Reset
        await recoverableState.reset();

        expect(recoverableState.currentValue).toEqual(defaultState);
        expect(recoverableState.currentValue).not.toBe(defaultState); // Should be a new copy
    });

    test('should handle teardown gracefully when persistence is disabled', async () => {
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();
        await expect(recoverableState.teardown()).resolves.not.toThrow();
    });

    test('should handle arrays and complex objects in deep copy', async () => {
        const stateWithArray = {
            items: [1, 2, { nested: 'value' }],
        };

        const recoverableState = new RecoverableState(stateWithArray, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify array and nested object
        recoverableState.currentValue.items.push(4);
        (recoverableState.currentValue.items[2] as any).nested = 'modified';

        // Reset should restore original values
        await recoverableState.reset();

        expect(recoverableState.currentValue.items).toEqual([1, 2, { nested: 'value' }]);
    });

    test('should handle custom classes with serialize/deserialize', async () => {
        class CustomData {
            constructor(
                public value: string,
                public count: number,
            ) {}
        }

        interface StateWithCustomClass {
            data: CustomData;
            name: string;
        }

        const stateWithCustomClass: StateWithCustomClass = {
            data: new CustomData('test', 42),
            name: 'example',
        };

        const serialize = vi.fn((state: StateWithCustomClass) => ({
            data: {
                value: state.data.value,
                count: state.data.count,
            },
            name: state.name,
        }));

        const deserialize = vi.fn(
            (serialized: any): StateWithCustomClass => ({
                data: new CustomData(serialized.data.value, serialized.data.count),
                name: serialized.name,
            }),
        );

        const recoverableState = new RecoverableState(stateWithCustomClass, {
            persistStateKey: 'test-key',
            persistenceEnabled: true,
            serialize,
            deserialize,
        });

        await recoverableState.initialize();

        // Verify the custom class is properly handled
        expect(recoverableState.currentValue.data).toBeInstanceOf(CustomData);
        expect(recoverableState.currentValue.data.value).toBe('test');
        expect(recoverableState.currentValue.name).toBe('example');

        expect(deserialize).toHaveBeenCalled();

        recoverableState.currentValue.data.value = 'updated';
        await recoverableState.persistState();

        const persistedState = (await localStorageEmulator.getKeyValueStore().getRecord('test-key'))?.value;
        expect(persistedState).toMatchObject({
            data: { value: 'updated' },
        });

        expect(serialize).toHaveBeenCalled();
    });
});

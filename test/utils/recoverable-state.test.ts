import { RecoverableState } from '../packages/utils/src/internals/recoverable-state';

interface TestState {
    counter: number;
    message: string;
    data: { nested: string };
}

describe('RecoverableState', () => {
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

    test('should handle deep copy correctly with nested objects', async () => {
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify nested object
        recoverableState.currentValue.data.nested = 'modified';

        // Reset should restore original nested value
        await recoverableState.reset();

        expect(recoverableState.currentValue.data.nested).toBe('value');
    });

    test('should handle teardown gracefully when persistence is disabled', async () => {
        const recoverableState = new RecoverableState(defaultState, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();
        await expect(recoverableState.teardown()).resolves.not.toThrow();
    });

    test('should handle arrays in deep copy', async () => {
        const stateWithArray = {
            items: [1, 2, { nested: 'value' }],
            dates: [new Date('2023-01-01')],
        };

        const recoverableState = new RecoverableState(stateWithArray, {
            persistStateKey: 'test-key',
            persistenceEnabled: false,
        });

        await recoverableState.initialize();

        // Modify array
        recoverableState.currentValue.items.push(4);
        (recoverableState.currentValue.items[2] as any).nested = 'modified';

        // Reset should restore original values
        await recoverableState.reset();

        expect(recoverableState.currentValue.items).toEqual([1, 2, { nested: 'value' }]);
        expect(recoverableState.currentValue.dates[0]).toBeInstanceOf(Date);
        expect(recoverableState.currentValue.dates[0].getTime()).toBe(new Date('2023-01-01').getTime());
    });
});

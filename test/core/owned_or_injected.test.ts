import { OwnedOrInjected } from '../../packages/core/src/owned_or_injected.js';

describe('OwnedOrInjected', () => {
    describe('resolve() with an injected instance', () => {
        it('is present and not owned', () => {
            const injected = { name: 'injected' };
            const dep = OwnedOrInjected.resolve(injected);

            expect(dep.isPresent).toBe(true);
            expect(dep.isOwned).toBe(false);
            expect(dep.value).toBe(injected);
        });

        it('does not run owned-only lifecycle hooks', async () => {
            const dep = OwnedOrInjected.resolve({ name: 'injected' });
            const hook = vitest.fn();

            const result = await dep.ifOwned(hook);

            expect(hook).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
        });

        it('cannot be set() over a borrowed instance', () => {
            const dep = OwnedOrInjected.resolve({ name: 'injected' });

            expect(() => dep.set({ name: 'replacement' })).toThrow('borrowed');
        });

        it('ignores the buildDefault factory when an instance is injected', () => {
            const injected = { name: 'injected' };
            const factory = vitest.fn(() => ({ name: 'default' }));

            const dep = OwnedOrInjected.resolve(injected, factory);

            expect(factory).not.toHaveBeenCalled();
            expect(dep.isOwned).toBe(false);
            expect(dep.value).toBe(injected);
        });
    });

    describe('resolve() with a buildDefault factory', () => {
        it('builds the default eagerly, owned and present', () => {
            const built = { name: 'default' };
            const factory = vitest.fn(() => built);

            const dep = OwnedOrInjected.resolve<{ name: string }>(undefined, factory);

            expect(factory).toHaveBeenCalledTimes(1);
            expect(dep.isOwned).toBe(true);
            expect(dep.isPresent).toBe(true);
            expect(dep.value).toBe(built);
        });

        it('runs owned-only lifecycle hooks on the built default', async () => {
            const dep = OwnedOrInjected.resolve<{ closed: boolean }>(undefined, () => ({ closed: false }));

            await dep.ifOwned((value) => {
                value.closed = true;
            });

            expect(dep.value.closed).toBe(true);
        });
    });

    describe('resolve() without an injected instance or factory', () => {
        it('is owned but not present until set()', () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();

            expect(dep.isOwned).toBe(true);
            expect(dep.isPresent).toBe(false);
        });

        it('throws when reading value before it is set', () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();

            expect(() => dep.value).toThrow('not initialized');
        });

        it('does not run owned-only lifecycle hooks while unset', async () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();
            const hook = vitest.fn();

            await dep.ifOwned(hook);

            expect(hook).not.toHaveBeenCalled();
        });

        it('becomes present after set() and returns the value', () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();
            const built = { name: 'default' };

            const returned = dep.set(built);

            expect(returned).toBe(built);
            expect(dep.isPresent).toBe(true);
            expect(dep.value).toBe(built);
            expect(dep.isOwned).toBe(true);
        });

        it('exposes maybeValue as undefined while unset and the value once set', () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();
            expect(dep.maybeValue).toBeUndefined();

            const built = { name: 'default' };
            dep.set(built);

            expect(dep.maybeValue).toBe(built);
        });

        it('cannot be set() twice', () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();
            dep.set({ name: 'default' });

            expect(() => dep.set({ name: 'again' })).toThrow('already initialized');
        });

        it('runs owned-only lifecycle hooks once present', async () => {
            const dep = OwnedOrInjected.resolve<{ name: string }>();
            const built = { name: 'default' };
            dep.set(built);

            const hook = vitest.fn(async (value: { name: string }) => `torn down ${value.name}`);
            const result = await dep.ifOwned(hook);

            expect(hook).toHaveBeenCalledWith(built);
            expect(result).toBe('torn down default');
        });
    });

    describe('distinct Injected / Owned types', () => {
        interface Borrowed {
            use(): void;
        }
        class Built implements Borrowed {
            use(): void {}
            teardown(): string {
                return 'torn down';
            }
        }

        it('exposes value as the Injected type and ifOwned as the Owned type', async () => {
            const dep = OwnedOrInjected.resolve<Borrowed, Built>(undefined, () => new Built());

            // value is the borrowed/public type
            const asBorrowed: Borrowed = dep.value;
            expect(asBorrowed).toBeInstanceOf(Built);

            // ifOwned hands over the concrete owned type — teardown() is only on Built, no cast needed
            const result = await dep.ifOwned((pool) => pool.teardown());
            expect(result).toBe('torn down');
        });

        it('does not run the owned lifecycle for an injected Borrowed instance', async () => {
            const injected: Borrowed = { use() {} };
            const dep = OwnedOrInjected.resolve<Borrowed, Built>(injected, () => new Built());

            const hook = vitest.fn((pool: Built) => pool.teardown());
            const result = await dep.ifOwned(hook);

            expect(hook).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
        });
    });

    describe('ifOwned()', () => {
        it('awaits async lifecycle hooks', async () => {
            const dep = OwnedOrInjected.resolve<{ closed: boolean }>();
            const instance = { closed: false };
            dep.set(instance);

            await dep.ifOwned(async (value) => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                value.closed = true;
            });

            expect(instance.closed).toBe(true);
        });
    });
});

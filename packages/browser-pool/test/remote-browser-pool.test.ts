import { EventEmitter } from 'node:events';

import { vi } from 'vitest';

import { BROWSER_POOL_EVENTS } from '../src/events.js';
import type { BrowserPool } from '../src/browser-pool.js';
import { RemoteBrowserPool } from '../src/remote-browser-pool.js';

/**
 * A minimal stand-in for {@link BrowserPool} exposing only the surface
 * {@link RemoteBrowserPool} touches: the four `IBrowserPool` methods, `destroy`,
 * `maxOpenBrowsers`, the two capacity helpers, and the event emitter.
 */
function createFakePool(overrides: Partial<Record<string, any>> = {}) {
    const emitter = new EventEmitter();
    const pool = Object.assign(emitter, {
        maxOpenBrowsers: Infinity,
        hasFreeBrowserSlot: vi.fn(() => true),
        hasActiveBrowserWithFreeCapacity: vi.fn(() => false),
        newPage: vi.fn(async (options?: any) => ({ id: options?.id ?? 'page' })),
        closePage: vi.fn(async () => {}),
        extractPageState: vi.fn(async () => ({ cookies: [] })),
        injectPageState: vi.fn(async () => {}),
        destroy: vi.fn(async () => {}),
        ...overrides,
    });
    return pool as unknown as BrowserPool;
}

describe('RemoteBrowserPool', () => {
    describe('construction', () => {
        it('applies maxOpenBrowsers to the wrapped pool', () => {
            const fake = createFakePool();
            const remote = new RemoteBrowserPool({ browserPool: fake, maxOpenBrowsers: 3 });

            expect(fake.maxOpenBrowsers).toBe(3);
            expect(remote.maxOpenBrowsers).toBe(3);
        });

        it('leaves the wrapped pool default when maxOpenBrowsers is omitted', () => {
            const fake = createFakePool();
            const remote = new RemoteBrowserPool({ browserPool: fake });

            expect(remote.maxOpenBrowsers).toBe(Infinity);
        });

        it('proxies maxOpenBrowsers writes through to the wrapped pool', () => {
            const fake = createFakePool();
            const remote = new RemoteBrowserPool({ browserPool: fake });

            remote.maxOpenBrowsers = 5;

            expect(fake.maxOpenBrowsers).toBe(5);
        });
    });

    describe('delegation', () => {
        it('forwards closePage / extractPageState / injectPageState / destroy', async () => {
            const fake = createFakePool();
            const remote = new RemoteBrowserPool<{ id: string }>({ browserPool: fake });
            const page = { id: 'p1' };
            const error = new Error('boom');

            await remote.closePage(page, { error });
            await remote.extractPageState(page);
            await remote.injectPageState(page, { cookies: [] });
            await remote.destroy();

            expect(fake.closePage).toHaveBeenCalledWith(page, { error });
            expect(fake.extractPageState).toHaveBeenCalledWith(page);
            expect(fake.injectPageState).toHaveBeenCalledWith(page, { cookies: [] });
            expect(fake.destroy).toHaveBeenCalledOnce();
        });
    });

    describe('newPage throttle', () => {
        it('opens immediately when a browser slot is free', async () => {
            const fake = createFakePool({ hasFreeBrowserSlot: vi.fn(() => true) });
            const remote = new RemoteBrowserPool({ browserPool: fake, maxOpenBrowsers: 2 });

            const page = await remote.newPage({ id: 'x' });

            expect(page).toEqual({ id: 'x' });
            expect(fake.newPage).toHaveBeenCalledOnce();
        });

        it('opens immediately when an active browser has free page capacity', async () => {
            const fake = createFakePool({
                hasFreeBrowserSlot: vi.fn(() => false),
                hasActiveBrowserWithFreeCapacity: vi.fn(() => true),
            });
            const remote = new RemoteBrowserPool({ browserPool: fake, maxOpenBrowsers: 1 });

            await remote.newPage();

            expect(fake.newPage).toHaveBeenCalledOnce();
        });

        it('waits while at capacity, then opens once a browser is retired', async () => {
            let atCapacity = true;
            const fake = createFakePool({
                hasFreeBrowserSlot: vi.fn(() => !atCapacity),
                hasActiveBrowserWithFreeCapacity: vi.fn(() => false),
            });
            const remote = new RemoteBrowserPool({ browserPool: fake, maxOpenBrowsers: 1, slotPollIntervalMillis: 50 });

            const pagePromise = remote.newPage();
            let resolved = false;
            void pagePromise.then(() => {
                resolved = true;
            });

            // Still blocked while at capacity.
            await new Promise((r) => setTimeout(r, 20));
            expect(resolved).toBe(false);
            expect(fake.newPage).not.toHaveBeenCalled();

            // Free a slot and signal it.
            atCapacity = false;
            fake.emit(BROWSER_POOL_EVENTS.BROWSER_RETIRED);

            await pagePromise;
            expect(resolved).toBe(true);
            expect(fake.newPage).toHaveBeenCalledOnce();
        });

        it('re-checks capacity via the poll fallback when no event fires', async () => {
            let atCapacity = true;
            const fake = createFakePool({
                hasFreeBrowserSlot: vi.fn(() => !atCapacity),
                hasActiveBrowserWithFreeCapacity: vi.fn(() => false),
            });
            const remote = new RemoteBrowserPool({ browserPool: fake, maxOpenBrowsers: 1, slotPollIntervalMillis: 20 });

            const pagePromise = remote.newPage();
            setTimeout(() => {
                atCapacity = false;
            }, 30);

            await pagePromise;
            expect(fake.newPage).toHaveBeenCalledOnce();
        });
    });
});

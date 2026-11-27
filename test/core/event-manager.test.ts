import { setTimeout as sleep } from 'node:timers/promises';

import { BasicCrawler } from '@crawlee/basic';
import type { EventManager } from '@crawlee/core';
import { Configuration, EventType, KeyValueStore, MemoryStorageBackend, serviceLocator } from '@crawlee/core';

describe('EventManager', () => {
    beforeEach(() => {
        serviceLocator.setConfiguration(new Configuration({ persistStateIntervalMillis: 20 }));
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    afterEach(async () => {
        await serviceLocator.getEventManager().close();
    });

    async function waitForPersistState(events: EventManager) {
        await new Promise<void>((resolve) => {
            const listener = () => {
                events.off(EventType.PERSIST_STATE, listener);
                resolve();
            };
            events.on(EventType.PERSIST_STATE, listener);
        });
        await events.waitForAllListenersToComplete();
    }

    test('a crawler with its own configuration shares the event manager of the process', async () => {
        let crawlerEvents: EventManager | undefined;

        const crawler = new BasicCrawler({
            configuration: new Configuration({ persistStateIntervalMillis: 20 }),
            storageBackend: new MemoryStorageBackend(),
            requestHandler: () => {
                crawlerEvents = serviceLocator.getEventManager();
            },
        });

        await crawler.run(['https://example.com']);

        expect(crawlerEvents).toBe(serviceLocator.getEventManager());
    });

    test('an auto-saved value is persisted periodically without a crawler', async () => {
        const store = await KeyValueStore.open();
        const state = await store.getAutoSavedValue<Record<string, unknown>>('state', {});
        state.foo = 'bar';

        await waitForPersistState(serviceLocator.getEventManager());

        expect(await store.getValue('state')).toEqual({ foo: 'bar' });
    });

    test('a crawler run does not stop the event manager for anything else', async () => {
        const store = await KeyValueStore.open();
        const state = await store.getAutoSavedValue<Record<string, unknown>>('state', {});

        await new BasicCrawler({ requestHandler: () => {} }).run(['https://example.com']);

        state.foo = 'bar';
        await waitForPersistState(serviceLocator.getEventManager());

        expect(await store.getValue('state')).toEqual({ foo: 'bar' });
    });

    test('a self-started event manager emits a final persistState before the process exits', async () => {
        serviceLocator.reset();
        serviceLocator.setConfiguration(new Configuration({ persistStateIntervalMillis: 60_000 }));
        serviceLocator.setStorageBackend(new MemoryStorageBackend());

        const store = await KeyValueStore.open();
        const state = await store.getAutoSavedValue<Record<string, unknown>>('state', {});
        state.foo = 'bar';

        process.emit('beforeExit', 0);
        await serviceLocator.getEventManager().waitForAllListenersToComplete();

        expect(await store.getValue('state')).toEqual({ foo: 'bar' });
    });

    test('emitting after close() does not start the event manager again', async () => {
        const events = serviceLocator.getEventManager();
        const listener = vitest.fn();
        events.on(EventType.PERSIST_STATE, listener);

        await events.close();
        listener.mockClear();

        events.emit(EventType.EXIT);
        await sleep(100);

        expect(listener).not.toHaveBeenCalled();
    });

    test('an explicitly initialized event manager is left to its owner on exit', async () => {
        const events = serviceLocator.getEventManager();
        await events.init();

        const listener = vitest.fn();
        events.on(EventType.PERSIST_STATE, listener);
        listener.mockClear();

        process.emit('beforeExit', 0);
        expect(listener).not.toHaveBeenCalled();

        await events.close();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test('systemInfo is only sampled while something listens to it', async () => {
        const events = serviceLocator.getEventManager();
        const listener = vitest.fn();

        events.on(EventType.SYSTEM_INFO, listener);
        await vitest.waitFor(() => expect(listener).toHaveBeenCalled());

        events.off(EventType.SYSTEM_INFO, listener);
        await events.waitForAllListenersToComplete();
        listener.mockClear();

        const otherListener = vitest.fn();
        events.on(EventType.PERSIST_STATE, otherListener);
        await sleep(100);

        expect(listener).not.toHaveBeenCalled();
    });

    test('systemInfo listeners that outlive close() are served again once the manager restarts', async () => {
        const events = serviceLocator.getEventManager();
        const listener = vitest.fn();

        events.on(EventType.SYSTEM_INFO, listener);
        await vitest.waitFor(() => expect(listener).toHaveBeenCalled());

        await events.close();
        listener.mockClear();

        events.on(EventType.PERSIST_STATE, () => {});
        await vitest.waitFor(() => expect(listener).toHaveBeenCalled());
    });
});

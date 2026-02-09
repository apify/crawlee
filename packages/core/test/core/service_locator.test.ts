import { Configuration, LocalEventManager, ServiceConflictError, ServiceLocator, serviceLocator } from '@crawlee/core';
import { MemoryStorage } from '@crawlee/memory-storage';

// Reset global service locator before each test
beforeEach(() => {
    serviceLocator.reset();
});

describe('ServiceLocator', () => {
    describe('Configuration', () => {
        test('default configuration', () => {
            const config = serviceLocator.getConfiguration();

            // Should return a Configuration instance
            expect(config).toBeInstanceOf(Configuration);
        });

        test('custom configuration', () => {
            const customConfig = new Configuration({ headless: false });
            serviceLocator.setConfiguration(customConfig);
            const config = serviceLocator.getConfiguration();

            expect(config).toBe(customConfig);
        });

        test('configuration overwrite not possible', () => {
            const defaultConfig = new Configuration();
            serviceLocator.setConfiguration(defaultConfig);

            const customConfig = new Configuration({ headless: false });

            expect(() => {
                serviceLocator.setConfiguration(customConfig);
            }).toThrow(ServiceConflictError);
        });

        test('configuration conflict', () => {
            // Retrieve configuration first
            serviceLocator.getConfiguration();

            const customConfig = new Configuration({ headless: false });

            expect(() => {
                serviceLocator.setConfiguration(customConfig);
            }).toThrow(ServiceConflictError);
            expect(() => {
                serviceLocator.setConfiguration(customConfig);
            }).toThrow(/Configuration is already in use/);
        });
    });

    describe('EventManager', () => {
        test('default event manager', () => {
            const defaultEventManager = serviceLocator.getEventManager();
            expect(defaultEventManager).toBeInstanceOf(LocalEventManager);
        });

        test('custom event manager', () => {
            const customEventManager = new LocalEventManager();
            serviceLocator.setEventManager(customEventManager);
            const eventManager = serviceLocator.getEventManager();

            expect(eventManager).toBe(customEventManager);
        });

        test('event manager overwrite not possible', () => {
            const customEventManager = new LocalEventManager();
            serviceLocator.setEventManager(customEventManager);

            const anotherCustomEventManager = new LocalEventManager();

            expect(() => {
                serviceLocator.setEventManager(anotherCustomEventManager);
            }).toThrow(ServiceConflictError);
        });

        test('event manager conflict', () => {
            // Retrieve event manager first
            serviceLocator.getEventManager();

            const customEventManager = new LocalEventManager();

            expect(() => {
                serviceLocator.setEventManager(customEventManager);
            }).toThrow(ServiceConflictError);
            expect(() => {
                serviceLocator.setEventManager(customEventManager);
            }).toThrow(/EventManager is already in use/);
        });
    });

    describe('StorageClient', () => {
        test('default storage client', () => {
            const defaultStorageClient = serviceLocator.getStorageClient();
            expect(defaultStorageClient).toBeInstanceOf(MemoryStorage);
        });

        test('custom storage client', () => {
            const customStorageClient = new MemoryStorage();
            serviceLocator.setStorageClient(customStorageClient);
            const storageClient = serviceLocator.getStorageClient();

            expect(storageClient).toBe(customStorageClient);
        });

        test('storage client overwrite not possible', () => {
            const customStorageClient = new MemoryStorage();
            serviceLocator.setStorageClient(customStorageClient);

            const anotherCustomStorageClient = new MemoryStorage();

            expect(() => {
                serviceLocator.setStorageClient(anotherCustomStorageClient);
            }).toThrow(ServiceConflictError);
        });

        test('storage client conflict', () => {
            // Retrieve storage client first
            serviceLocator.getStorageClient();

            const customStorageClient = new MemoryStorage();

            expect(() => {
                serviceLocator.setStorageClient(customStorageClient);
            }).toThrow(ServiceConflictError);
            expect(() => {
                serviceLocator.setStorageClient(customStorageClient);
            }).toThrow(/StorageClient is already in use/);
        });
    });

    describe('Reset functionality', () => {
        test('reset clears all services', () => {
            const customConfig = new Configuration({ headless: false });
            const customEventManager = new LocalEventManager();
            const customStorageClient = new MemoryStorage();

            serviceLocator.setConfiguration(customConfig);
            serviceLocator.setEventManager(customEventManager);
            serviceLocator.setStorageClient(customStorageClient);

            // Verify they're set
            expect(serviceLocator.getConfiguration()).toBe(customConfig);
            expect(serviceLocator.getEventManager()).toBe(customEventManager);
            expect(serviceLocator.getStorageClient()).toBe(customStorageClient);

            // Reset
            serviceLocator.reset();

            // After reset, should be able to set new instances
            const newConfig = new Configuration({ headless: true });
            serviceLocator.setConfiguration(newConfig);
            expect(serviceLocator.getConfiguration()).toBe(newConfig);
        });
    });

    describe('Same instance allowed', () => {
        test('setting same configuration instance is allowed', () => {
            const config = new Configuration();
            serviceLocator.setConfiguration(config);
            serviceLocator.getConfiguration();

            // Setting the same instance again should not throw
            expect(() => {
                serviceLocator.setConfiguration(config);
            }).not.toThrow();
        });

        test('setting same event manager instance is allowed', () => {
            const eventManager = new LocalEventManager();
            serviceLocator.setEventManager(eventManager);
            serviceLocator.getEventManager();

            // Setting the same instance again should not throw
            expect(() => {
                serviceLocator.setEventManager(eventManager);
            }).not.toThrow();
        });

        test('setting same storage client instance is allowed', () => {
            const storageClient = new MemoryStorage();
            serviceLocator.setStorageClient(storageClient);
            serviceLocator.getStorageClient();

            // Setting the same instance again should not throw
            expect(() => {
                serviceLocator.setStorageClient(storageClient);
            }).not.toThrow();
        });
    });

    describe('Per-crawler ServiceLocator', () => {
        test('creating separate service locator for crawler', () => {
            const crawlerConfig = new Configuration({ headless: false });
            const crawlerStorage = new MemoryStorage();
            const crawlerEvents = new LocalEventManager(crawlerConfig);

            const crawlerLocator = new ServiceLocator(crawlerConfig, crawlerEvents, crawlerStorage);

            expect(crawlerLocator.getConfiguration()).toBe(crawlerConfig);
            expect(crawlerLocator.getEventManager()).toBe(crawlerEvents);
            expect(crawlerLocator.getStorageClient()).toBe(crawlerStorage);

            // Global service locator should remain independent
            expect(serviceLocator.getConfiguration()).not.toBe(crawlerConfig);
        });
    });
});

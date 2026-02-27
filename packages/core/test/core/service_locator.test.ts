import type { CrawleeLogger } from '@crawlee/core';
import { Configuration, LocalEventManager, ServiceConflictError, ServiceLocator, serviceLocator } from '@crawlee/core';
import { MemoryStorage } from '@crawlee/memory-storage';

import log from '@apify/log';

function makeMockLogger(overrides: Partial<CrawleeLogger> = {}): CrawleeLogger {
    const logger: CrawleeLogger = {
        getOptions: () => ({}),
        setOptions: () => {},
        child: () => logger,
        error: () => {},
        exception: () => {},
        softFail: () => {},
        warning: () => {},
        warningOnce: () => {},
        info: () => {},
        debug: () => {},
        perf: () => {},
        deprecated: () => {},
        internal: () => {},
        ...overrides,
    };
    return logger;
}

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
            const customEventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });
            serviceLocator.setEventManager(customEventManager);
            const eventManager = serviceLocator.getEventManager();

            expect(eventManager).toBe(customEventManager);
        });

        test('event manager overwrite not possible', () => {
            const customEventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });
            serviceLocator.setEventManager(customEventManager);

            const anotherCustomEventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });

            expect(() => {
                serviceLocator.setEventManager(anotherCustomEventManager);
            }).toThrow(ServiceConflictError);
        });

        test('event manager conflict', () => {
            // Retrieve event manager first
            serviceLocator.getEventManager();

            const customEventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });

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

    describe('Logger', () => {
        test('default logger returns log from @apify/log', () => {
            const defaultLogger = serviceLocator.getLogger();
            expect(defaultLogger).toBe(log);
        });

        test('custom logger can be set', () => {
            const customLogger = makeMockLogger();
            serviceLocator.setLogger(customLogger);
            expect(serviceLocator.getLogger()).toBe(customLogger);
        });

        test('logger overwrite not possible', () => {
            const firstLogger = makeMockLogger();
            serviceLocator.setLogger(firstLogger);

            const secondLogger = makeMockLogger();

            expect(() => {
                serviceLocator.setLogger(secondLogger);
            }).toThrow(ServiceConflictError);
        });

        test('logger conflict', () => {
            serviceLocator.getLogger();

            const customLogger = makeMockLogger();

            expect(() => {
                serviceLocator.setLogger(customLogger);
            }).toThrow(ServiceConflictError);
            expect(() => {
                serviceLocator.setLogger(customLogger);
            }).toThrow(/Logger is already in use/);
        });

        test('reset clears the logger', () => {
            const customLogger = makeMockLogger();
            serviceLocator.setLogger(customLogger);
            expect(serviceLocator.getLogger()).toBe(customLogger);

            serviceLocator.reset();

            // After reset, default logger should be returned
            expect(serviceLocator.getLogger()).toBe(log);
        });
    });

    describe('Reset functionality', () => {
        test('reset clears all services', () => {
            const customLogger = makeMockLogger();
            serviceLocator.setLogger(customLogger);

            const customConfig = new Configuration({ headless: false });
            const customEventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });
            const customStorageClient = new MemoryStorage();

            serviceLocator.setConfiguration(customConfig);
            serviceLocator.setEventManager(customEventManager);
            serviceLocator.setStorageClient(customStorageClient);

            // Verify they're set
            expect(serviceLocator.getConfiguration()).toBe(customConfig);
            expect(serviceLocator.getEventManager()).toBe(customEventManager);
            expect(serviceLocator.getStorageClient()).toBe(customStorageClient);
            expect(serviceLocator.getLogger()).toBe(customLogger);

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
            const eventManager = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });
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

        test('setting same logger instance is allowed', () => {
            const logger = makeMockLogger();
            serviceLocator.setLogger(logger);
            serviceLocator.getLogger();

            // Setting the same instance again should not throw
            expect(() => {
                serviceLocator.setLogger(logger);
            }).not.toThrow();
        });
    });

    describe('Per-crawler ServiceLocator', () => {
        test('creating separate service locator for crawler', () => {
            const crawlerConfig = new Configuration({ headless: false });
            const crawlerStorage = new MemoryStorage();
            const crawlerEvents = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });

            const crawlerLocator = new ServiceLocator(crawlerConfig, crawlerEvents, crawlerStorage);

            expect(crawlerLocator.getConfiguration()).toBe(crawlerConfig);
            expect(crawlerLocator.getEventManager()).toBe(crawlerEvents);
            expect(crawlerLocator.getStorageClient()).toBe(crawlerStorage);

            // Global service locator should remain independent
            expect(serviceLocator.getConfiguration()).not.toBe(crawlerConfig);
        });
    });
});

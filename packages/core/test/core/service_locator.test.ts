import type { CrawleeLogger } from '@crawlee/core';
import {
    ApifyLogAdapter,
    Configuration,
    LocalEventManager,
    MemoryStorageBackend,
    ServiceConflictError,
    ServiceLocator,
    serviceLocator,
} from '@crawlee/core';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';

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
        logWithLevel: () => {},
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

        test('warns about implicit configuration when configuration was not set beforehand', () => {
            const warningSpy = vi.fn();
            serviceLocator.setLogger(makeMockLogger({ warning: warningSpy }));

            serviceLocator.getEventManager();

            expect(warningSpy).toHaveBeenCalledWith(expect.stringMatching(/implicitly set configuration/));
        });

        test('does not warn about implicit configuration when configuration was already set', () => {
            const warningSpy = vi.fn();
            serviceLocator.setLogger(makeMockLogger({ warning: warningSpy }));
            serviceLocator.setConfiguration(new Configuration());

            serviceLocator.getEventManager();

            expect(warningSpy).not.toHaveBeenCalled();
        });
    });

    describe('StorageBackend', () => {
        test('default storage backend', () => {
            const defaultStorageBackend = serviceLocator.getStorageBackend();
            expect(defaultStorageBackend).toBeInstanceOf(FileSystemStorageBackend);
        });

        test('custom storage backend', () => {
            const customStorageBackend = new MemoryStorageBackend();
            serviceLocator.setStorageBackend(customStorageBackend);
            const storageBackend = serviceLocator.getStorageBackend();

            expect(storageBackend).toBe(customStorageBackend);
        });

        test('storage backend overwrite not possible', () => {
            const customStorageBackend = new MemoryStorageBackend();
            serviceLocator.setStorageBackend(customStorageBackend);

            const anotherCustomStorageBackend = new MemoryStorageBackend();

            expect(() => {
                serviceLocator.setStorageBackend(anotherCustomStorageBackend);
            }).toThrow(ServiceConflictError);
        });

        test('storage backend conflict', () => {
            // Retrieve storage backend first
            serviceLocator.getStorageBackend();

            const customStorageBackend = new MemoryStorageBackend();

            expect(() => {
                serviceLocator.setStorageBackend(customStorageBackend);
            }).toThrow(ServiceConflictError);
            expect(() => {
                serviceLocator.setStorageBackend(customStorageBackend);
            }).toThrow(/StorageBackend is already in use/);
        });

        test('warns about implicit configuration when configuration was not set beforehand', () => {
            const warningSpy = vi.fn();
            serviceLocator.setLogger(makeMockLogger({ warning: warningSpy }));

            serviceLocator.getStorageBackend();

            expect(warningSpy).toHaveBeenCalledWith(expect.stringMatching(/implicitly set configuration/));
        });

        test('does not warn about implicit configuration when configuration was already set', () => {
            const warningSpy = vi.fn();
            serviceLocator.setLogger(makeMockLogger({ warning: warningSpy }));
            serviceLocator.setConfiguration(new Configuration());

            serviceLocator.getStorageBackend();

            expect(warningSpy).not.toHaveBeenCalled();
        });
    });

    describe('Logger', () => {
        test('default logger returns an ApifyLogAdapter wrapping @apify/log', () => {
            const defaultLogger = serviceLocator.getLogger();
            expect(defaultLogger).toBeInstanceOf(ApifyLogAdapter);
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

        test('setting logger after getStorageBackend throws ServiceConflictError (logger already locked)', () => {
            // getStorageBackend() implicitly calls getLogger(), locking the logger
            serviceLocator.getStorageBackend();

            const customLogger = makeMockLogger();

            expect(() => {
                serviceLocator.setLogger(customLogger);
            }).toThrow(ServiceConflictError);
        });

        test('reset clears the logger', () => {
            const customLogger = makeMockLogger();
            serviceLocator.setLogger(customLogger);
            expect(serviceLocator.getLogger()).toBe(customLogger);

            serviceLocator.reset();

            // After reset, default ApifyLogAdapter should be returned
            expect(serviceLocator.getLogger()).toBeInstanceOf(ApifyLogAdapter);
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
            const customStorageBackend = new MemoryStorageBackend();

            serviceLocator.setConfiguration(customConfig);
            serviceLocator.setEventManager(customEventManager);
            serviceLocator.setStorageBackend(customStorageBackend);

            // Verify they're set
            expect(serviceLocator.getConfiguration()).toBe(customConfig);
            expect(serviceLocator.getEventManager()).toBe(customEventManager);
            expect(serviceLocator.getStorageBackend()).toBe(customStorageBackend);
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

        test('setting same storage backend instance is allowed', () => {
            const storageBackend = new MemoryStorageBackend();
            serviceLocator.setStorageBackend(storageBackend);
            serviceLocator.getStorageBackend();

            // Setting the same instance again should not throw
            expect(() => {
                serviceLocator.setStorageBackend(storageBackend);
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

    describe('getChildLog', () => {
        test('returns a child logger with the given prefix', () => {
            const children: CrawleeLogger[] = [];
            const mockLogger = makeMockLogger({
                child: (options) => {
                    const child = makeMockLogger({ getOptions: () => options });
                    children.push(child);
                    return child;
                },
            });
            serviceLocator.setLogger(mockLogger);

            const child = serviceLocator.getChildLog('Test Prefix');

            expect(children).toHaveLength(1);
            expect(child.getOptions()).toEqual({ prefix: 'Test Prefix' });
        });

        test('delegates to the current service locator context', () => {
            const crawlerLocator = new ServiceLocator();
            const mockLogger = makeMockLogger({
                child: (options) => makeMockLogger({ getOptions: () => options }),
            });
            crawlerLocator.setLogger(mockLogger);

            const child = crawlerLocator.getChildLog('Crawler Module');
            expect(child.getOptions()).toEqual({ prefix: 'Crawler Module' });
        });
    });

    describe('Per-crawler ServiceLocator', () => {
        test('creating separate service locator for crawler', () => {
            const crawlerConfig = new Configuration({ headless: false });
            const crawlerStorage = new MemoryStorageBackend();
            const crawlerEvents = new LocalEventManager({
                persistStateIntervalMillis: 1000,
                systemInfoIntervalMillis: 1000,
            });

            const crawlerLocator = new ServiceLocator(crawlerConfig, crawlerEvents, crawlerStorage);

            expect(crawlerLocator.getConfiguration()).toBe(crawlerConfig);
            expect(crawlerLocator.getEventManager()).toBe(crawlerEvents);
            expect(crawlerLocator.getStorageBackend()).toBe(crawlerStorage);

            // Global service locator should remain independent
            expect(serviceLocator.getConfiguration()).not.toBe(crawlerConfig);
        });
    });
});

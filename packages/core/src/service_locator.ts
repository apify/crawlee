import { AsyncLocalStorage } from 'node:async_hooks';

import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import type { StorageBackend } from '@crawlee/types';

import log from '@apify/log';

import { Configuration } from './configuration.js';
import { ServiceConflictError } from './errors.js';
import type { EventManager } from './events/event_manager.js';
import { LocalEventManager } from './events/local_event_manager.js';
import type { CrawleeLogger } from './log.js';
import { ApifyLogAdapter } from './log.js';
import { MemoryStorageBackend } from './memory-storage/index.js';
import { StorageInstanceManager } from './storages/storage_instance_manager.js';

interface ServiceLocatorInterface {
    /**
     * Get the configuration.
     * Creates a default Configuration instance if none has been set.
     */
    getConfiguration(): Configuration;

    /**
     * Set the configuration.
     *
     * @param configuration The configuration to set
     * @throws {ServiceConflictError} If a different configuration has already been retrieved
     */
    setConfiguration(configuration: Configuration): void;

    /**
     * Get the event manager.
     * Creates a default LocalEventManager instance if none has been set.
     */
    getEventManager(): EventManager;

    /**
     * Set the event manager.
     *
     * @param eventManager The event manager to set
     * @throws {ServiceConflictError} If a different event manager has already been retrieved
     */
    setEventManager(eventManager: EventManager): void;

    /**
     * Get the storage backend.
     * Creates a default storage backend if none has been set — `FileSystemStorageBackend` when
     * `persistStorage` is enabled (the default), `MemoryStorageBackend` otherwise.
     */
    getStorageBackend(): StorageBackend;

    /**
     * Set the storage backend.
     *
     * @param storageBackend The storage backend to set
     * @throws {ServiceConflictError} If a different storage backend has already been retrieved
     */
    setStorageBackend(storageBackend: StorageBackend): void;

    /**
     * Get the logger.
     * Returns the default `@apify/log` logger if none has been set.
     */
    getLogger(): CrawleeLogger;

    /**
     * Set the logger.
     *
     * @param logger The logger to set
     * @throws {ServiceConflictError} If a different logger has already been retrieved
     */
    setLogger(logger: CrawleeLogger): void;

    /**
     * Get a child logger with the given prefix.
     * Equivalent to `getLogger().child({ prefix })`.
     */
    getChildLog(prefix: string): CrawleeLogger;

    /**
     * Get the storage instance manager (shared across all storage types).
     */
    getStorageInstanceManager(): StorageInstanceManager;

    /**
     * Resets the service locator to its initial state.
     * Used mainly for testing purposes.
     * @internal
     */
    reset(): void;
}

/**
 * Service locator for managing the services used by Crawlee.
 *
 * All services are initialized to their default value lazily.
 *
 * There are two primary usage patterns:
 *
 * **1. Global service locator (for default services):**
 * ```typescript
 * import { serviceLocator, BasicCrawler } from 'crawlee';
 *
 * // Optionally configure global services before creating crawlers
 * serviceLocator.setStorageBackend(myCustomClient);
 *
 * // Crawler uses global services
 * const crawler = new BasicCrawler({ ... });
 * ```
 *
 * **2. Per-crawler services (recommended for isolation):**
 * ```typescript
 * import { BasicCrawler, Configuration, LocalEventManager, MemoryStorageBackend } from 'crawlee';
 *
 * const crawler = new BasicCrawler({
 *     requestHandler: async ({ request }) => { ... },
 *     configuration: new Configuration({ ... }),  // custom config
 *     storageBackend: new MemoryStorageBackend(),          // custom storage
 *     eventManager: LocalEventManager.fromConfig(),  // custom events
 * });
 * // Crawler has its own isolated ServiceLocator instance
 * ```
 */
export class ServiceLocator implements ServiceLocatorInterface {
    private configuration?: Configuration;
    private eventManager?: EventManager;
    private storageBackend?: StorageBackend;
    private logger?: CrawleeLogger;

    /**
     * Unified storage instance manager for Dataset, KeyValueStore, and RequestQueue.
     * Shared across all ServiceLocator instances (global singleton), matching crawlee-python.
     * Per-crawler isolation is achieved via `clientCacheKey`, not separate manager instances.
     */
    private static storageInstanceManager?: StorageInstanceManager;

    /**
     * Creates a new ServiceLocator instance.
     *
     * @param configuration Optional configuration instance to use
     * @param eventManager Optional event manager instance to use
     * @param storageBackend Optional storage backend instance to use
     * @param logger Optional logger instance to use
     */
    constructor(
        configuration?: Configuration,
        eventManager?: EventManager,
        storageBackend?: StorageBackend,
        logger?: CrawleeLogger,
    ) {
        this.configuration = configuration;
        this.eventManager = eventManager;
        this.storageBackend = storageBackend;
        this.logger = logger;
    }

    getConfiguration(): Configuration {
        if (!this.configuration) {
            this.getLogger().debug('No configuration set, implicitly creating and using default Configuration.');
            this.configuration = new Configuration();
        }
        return this.configuration;
    }

    setConfiguration(configuration: Configuration): void {
        // Same instance, no need to do anything
        if (this.configuration === configuration) {
            return;
        }

        // Already have a different configuration that was retrieved
        if (this.configuration) {
            throw new ServiceConflictError('Configuration', configuration, this.configuration);
        }

        this.configuration = configuration;
    }

    getEventManager(): EventManager {
        if (!this.eventManager) {
            this.getLogger().debug('No event manager set, implicitly creating and using default LocalEventManager.');
            if (!this.configuration) {
                this.getLogger().warning(
                    'Implicit creation of event manager will implicitly set configuration as side effect. ' +
                        'It is advised to explicitly first set the configuration instead.',
                );
            }
            this.eventManager = LocalEventManager.fromConfig(this.getConfiguration());
        }
        return this.eventManager;
    }

    setEventManager(eventManager: EventManager): void {
        // Same instance, no need to do anything
        if (this.eventManager === eventManager) {
            return;
        }

        // Already have a different event manager that was retrieved
        if (this.eventManager) {
            throw new ServiceConflictError('EventManager', eventManager, this.eventManager);
        }

        this.eventManager = eventManager;
    }

    getStorageBackend(): StorageBackend {
        if (!this.storageBackend) {
            this.getLogger().debug(
                'No storage backend set, implicitly creating and using the default storage backend ' +
                    '(FileSystemStorageBackend when persistStorage is enabled, MemoryStorageBackend otherwise).',
            );
            if (!this.configuration) {
                this.getLogger().warning(
                    'Implicit creation of storage backend will implicitly set configuration as side effect. ' +
                        'It is advised to explicitly first set the configuration instead.',
                );
            }
            const config = this.getConfiguration();
            this.storageBackend = config.persistStorage
                ? new FileSystemStorageBackend({
                      localDataDirectory: config.storageDir,
                      logger: this.getLogger().child({ prefix: 'FileSystemStorageBackend' }),
                  })
                : new MemoryStorageBackend({
                      logger: this.getLogger().child({ prefix: 'MemoryStorageBackend' }),
                  });
        }
        return this.storageBackend;
    }

    setStorageBackend(storageBackend: StorageBackend): void {
        // Same instance, no need to do anything
        if (this.storageBackend === storageBackend) {
            return;
        }

        // Already have a different storage backend that was retrieved
        if (this.storageBackend) {
            throw new ServiceConflictError('StorageBackend', storageBackend, this.storageBackend);
        }

        this.storageBackend = storageBackend;
    }

    getLogger(): CrawleeLogger {
        if (!this.logger) {
            this.logger = new ApifyLogAdapter(log);
        }
        return this.logger;
    }

    setLogger(logger: CrawleeLogger): void {
        if (this.logger === logger) {
            return;
        }

        if (this.logger) {
            throw new ServiceConflictError('Logger', logger, this.logger);
        }

        this.logger = logger;
    }

    getChildLog(prefix: string): CrawleeLogger {
        return this.getLogger().child({ prefix });
    }

    getStorageInstanceManager(): StorageInstanceManager {
        if (!ServiceLocator.storageInstanceManager) {
            ServiceLocator.storageInstanceManager = new StorageInstanceManager();
        }
        return ServiceLocator.storageInstanceManager;
    }

    reset(): void {
        this.configuration = undefined;
        this.eventManager = undefined;
        this.storageBackend = undefined;
        this.logger = undefined;
        ServiceLocator.storageInstanceManager?.clearCache();
        ServiceLocator.storageInstanceManager = undefined;
    }
}

/**
 * Used as the default service provider when crawlers don't specify custom services.
 *
 * Prefer the `serviceLocator` proxy below, which resolves to the scoped locator when one is active.
 * This is exported only so that test setup can reset global state without touching a scoped locator.
 *
 * @internal
 */
export const globalServiceLocator = new ServiceLocator();

const serviceLocatorStorage = new AsyncLocalStorage<ServiceLocatorInterface>();

/**
 * Wraps all methods on `target` so that any code they invoke will see the given
 * `serviceLocator` via `AsyncLocalStorage`, rather than the global one.
 *
 * Walks the prototype chain and replaces each method on the *instance* (not the prototype)
 * with a wrapper that calls `serviceLocatorStorage.run(serviceLocator, originalMethod)`.
 *
 * The `AsyncLocalStorage` context propagates through the entire sync/async call tree of each
 * wrapped method — including `super` calls, since the prototype methods execute within the
 * context established by the instance-level wrapper.
 *
 * @internal
 * @returns Scope control functions: `run` executes a callback within the scoped context,
 *   `enterScope`/`exitScope` allow entering/leaving the scope imperatively (e.g., for constructor bodies).
 */
export function bindMethodsToServiceLocator(
    serviceLocator: ServiceLocator,
    target: {},
): { run: <T>(fn: () => T) => T; enterScope: () => void; exitScope: () => void } {
    let proto = Object.getPrototypeOf(target);

    while (proto !== null && proto !== Object.prototype) {
        const propertyKeys = [...Object.getOwnPropertyNames(proto), ...Object.getOwnPropertySymbols(proto)];

        for (const propertyKey of propertyKeys) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, propertyKey);

            // We use property descriptors rather than accessing target[propertyKey] directly,
            // because that would trigger getters and cause unwanted side effects.
            // Skip getters, setters, and constructors — only wrap regular methods.
            if (
                propertyKey === 'constructor' ||
                !descriptor ||
                descriptor.get ||
                descriptor.set ||
                typeof descriptor.value !== 'function'
            )
                continue;

            const original = descriptor.value;
            (target as Record<string | symbol, unknown>)[propertyKey] = (...args: any[]) => {
                return serviceLocatorStorage.run(serviceLocator, () => {
                    return original.apply(target, args);
                });
            };
        }

        proto = Object.getPrototypeOf(proto);
    }

    let previousStore: ServiceLocatorInterface | undefined;

    return {
        run: <T>(fn: () => T): T => serviceLocatorStorage.run(serviceLocator, fn),
        enterScope: () => {
            previousStore = serviceLocatorStorage.getStore();
            serviceLocatorStorage.enterWith(serviceLocator);
        },
        exitScope: () => {
            serviceLocatorStorage.enterWith(previousStore as any); // casting to any so that `undefined` is accepted - this "unsets" the AsyncLocalStorage
        },
    };
}

export const serviceLocator = new Proxy({} as ServiceLocatorInterface, {
    get(_target, prop) {
        const active = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        const value = Reflect.get(active, prop, active);
        if (typeof value === 'function') {
            return value.bind(active);
        }
        return value;
    },
    set(_target, prop) {
        throw new TypeError(
            `Cannot set property '${String(prop)}' on serviceLocator directly. Use the setter methods (e.g. setConfiguration(), setStorageBackend()) instead.`,
        );
    },
});

import { AsyncLocalStorage } from 'node:async_hooks';

import { MemoryStorage } from '@crawlee/memory-storage';
import type { StorageClient } from '@crawlee/types';

import log from '@apify/log';

import { Configuration } from './configuration.js';
import { ServiceConflictError } from './errors.js';
import type { EventManager } from './events/event_manager.js';
import { LocalEventManager } from './events/local_event_manager.js';
import type { IStorage, StorageManager } from './storages/storage_manager.js';
import type { Constructor } from './typedefs.js';

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
     * Get the storage client.
     * Creates a default MemoryStorage instance if none has been set.
     */
    getStorageClient(): StorageClient;

    /**
     * Set the storage client.
     *
     * @param storageClient The storage client to set
     * @throws {ServiceConflictError} If a different storage client has already been retrieved
     */
    setStorageClient(storageClient: StorageClient): void;

    getStorageManager(constructor: Constructor<IStorage>): StorageManager | undefined;

    setStorageManager(constructor: Constructor<IStorage>, storageManager: StorageManager): void;

    /**
     * Clears all storage manager caches.
     * @internal
     */
    clearStorageManagerCache(): void;

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
 * serviceLocator.setStorageClient(myCustomClient);
 *
 * // Crawler uses global services
 * const crawler = new BasicCrawler({ ... });
 * ```
 *
 * **2. Per-crawler services (recommended for isolation):**
 * ```typescript
 * import { BasicCrawler, Configuration, LocalEventManager } from 'crawlee';
 * import { MemoryStorage } from '@crawlee/memory-storage';
 *
 * const crawler = new BasicCrawler(
 *     { ... },
 *     new Configuration({ ... }),  // custom config
 *     new MemoryStorage(),          // custom storage
 *     new LocalEventManager(),      // custom events
 * );
 * // Crawler has its own isolated ServiceLocator instance
 * ```
 */
export class ServiceLocator implements ServiceLocatorInterface {
    private configuration?: Configuration;
    private eventManager?: EventManager;
    private storageClient?: StorageClient;

    /**
     * Storage managers for Dataset, KeyValueStore, and RequestQueue.
     * Manages caching and lifecycle of storage instances.
     */
    private storageManagers = new Map<Constructor, StorageManager>();

    /**
     * Creates a new ServiceLocator instance.
     *
     * @param configuration Optional configuration instance to use
     * @param eventManager Optional event manager instance to use
     * @param storageClient Optional storage client instance to use
     */
    constructor(configuration?: Configuration, eventManager?: EventManager, storageClient?: StorageClient) {
        this.configuration = configuration;
        this.eventManager = eventManager;
        this.storageClient = storageClient;
    }

    getConfiguration(): Configuration {
        if (!this.configuration) {
            log.debug('No configuration set, implicitly creating and using default Configuration.');
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
            log.debug('No event manager set, implicitly creating and using default LocalEventManager.');
            if (!this.configuration) {
                log.debug(
                    'Implicit creation of event manager will implicitly set configuration as side effect. ' +
                        'It is advised to explicitly first set the configuration instead.',
                );
            }
            this.eventManager = new LocalEventManager();
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

    getStorageClient(): StorageClient {
        if (!this.storageClient) {
            log.debug('No storage client set, implicitly creating and using default MemoryStorage.');
            if (!this.configuration) {
                log.warning(
                    'Implicit creation of storage client will implicitly set configuration as side effect. ' +
                        'It is advised to explicitly first set the configuration instead.',
                );
            }
            const config = this.getConfiguration();
            this.storageClient = new MemoryStorage({
                persistStorage: config.get('persistStorage'),
            });
        }
        return this.storageClient;
    }

    setStorageClient(storageClient: StorageClient): void {
        // Same instance, no need to do anything
        if (this.storageClient === storageClient) {
            return;
        }

        // Already have a different storage client that was retrieved
        if (this.storageClient) {
            throw new ServiceConflictError('StorageClient', storageClient, this.storageClient);
        }

        this.storageClient = storageClient;
    }

    getStorageManager(constructor: Constructor<IStorage>): StorageManager | undefined {
        return this.storageManagers.get(constructor);
    }

    setStorageManager(constructor: Constructor<IStorage>, storageManager: StorageManager): void {
        this.storageManagers.set(constructor, storageManager);
    }

    clearStorageManagerCache(): void {
        this.storageManagers.forEach((manager) => {
            // KeyValueStore has a clearCache method on its instances
            if ((manager as any).name === 'KeyValueStore') {
                (manager as any).cache?.forEach((item: any) => {
                    item.clearCache?.();
                });
            }
        });
        this.storageManagers.clear();
    }

    reset(): void {
        this.configuration = undefined;
        this.eventManager = undefined;
        this.storageClient = undefined;
        this.clearStorageManagerCache();
    }
}

/**
 * Used as the default service provider when crawlers don't specify custom services.
 */
const globalServiceLocator = new ServiceLocator();

const serviceLocatorStorage = new AsyncLocalStorage<ServiceLocatorInterface>();

/**
 * Wraps all methods on `target` so that any code they invoke will see the given
 * `serviceLocator` via `AsyncLocalStorage`, rather than the global one.
 *
 * Walks the prototype chain and replaces each method with a wrapper that calls
 * `asyncLocalStorage.run(serviceLocator, originalMethod)`.
 * @internal
 */
export function bindMethodsToServiceLocator(serviceLocator: ServiceLocator, target: {}) {
    let proto = Object.getPrototypeOf(target);

    while (proto !== null && proto !== Object.prototype) {
        for (const propertyName of Object.getOwnPropertyNames(proto)) {
            const descriptor = Object.getOwnPropertyDescriptor(proto, propertyName);

            // We use property descriptors rather than accessing target[propertyName] directly,
            // because that would trigger getters and cause unwanted side effects.
            // Skip getters, setters, and constructors — only wrap regular methods.
            if (
                propertyName === 'constructor' ||
                !descriptor ||
                descriptor.get ||
                descriptor.set ||
                typeof descriptor.value !== 'function'
            )
                continue;

            const original = descriptor.value;
            (target as Record<string, unknown>)[propertyName] = (...args: any[]) => {
                return serviceLocatorStorage.run(serviceLocator, () => {
                    return original.apply(target, args);
                });
            };
        }

        proto = Object.getPrototypeOf(proto);
    }
}

export const serviceLocator: ServiceLocatorInterface = {
    getConfiguration(): Configuration {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        return currentServiceLocator.getConfiguration();
    },
    setConfiguration(configuration: Configuration): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.setConfiguration(configuration);
    },
    getEventManager(): EventManager {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        return currentServiceLocator.getEventManager();
    },
    setEventManager(eventManager: EventManager): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.setEventManager(eventManager);
    },
    getStorageClient(): StorageClient {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        return currentServiceLocator.getStorageClient();
    },
    setStorageClient(storageClient: StorageClient): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.setStorageClient(storageClient);
    },
    getStorageManager(constructor: Constructor<IStorage>): StorageManager | undefined {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        return currentServiceLocator.getStorageManager(constructor);
    },
    setStorageManager(constructor: Constructor<IStorage>, storageManager: StorageManager): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.setStorageManager(constructor, storageManager);
    },
    clearStorageManagerCache(): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.clearStorageManagerCache();
    },
    reset(): void {
        const currentServiceLocator = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        currentServiceLocator.reset();
    },
};

import { AsyncLocalStorage } from 'node:async_hooks';
import { FileSystemStorageBackend } from '@crawlee/fs-storage';
import log from '@apify/log';
import { Configuration } from './configuration.js';
import { ServiceConflictError } from './errors.js';
import { LocalEventManager } from './events/local_event_manager.js';
import { ApifyLogAdapter } from './log.js';
import { MemoryStorageBackend } from './memory-storage/index.js';
import { StorageInstanceManager } from './storages/storage_instance_manager.js';
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
 *     configuration: new Configuration({ ... }),           // custom configuration
 *     storageBackend: new MemoryStorageBackend(),          // custom storage
 *     eventManager: LocalEventManager.fromConfiguration(), // custom events
 * });
 * // Crawler has its own isolated ServiceLocator instance
 * ```
 */
export class ServiceLocator {
    #configuration;
    #eventManager;
    #storageBackend;
    #logger;
    /**
     * Unified storage instance manager for Dataset, KeyValueStore, and RequestQueue.
     * Shared across all ServiceLocator instances (global singleton), matching crawlee-python.
     * Per-crawler isolation is achieved via `clientCacheKey`, not separate manager instances.
     */
    static #storageInstanceManager;
    /**
     * Creates a new ServiceLocator instance.
     *
     * @param configuration Optional configuration instance to use
     * @param eventManager Optional event manager instance to use
     * @param storageBackend Optional storage backend instance to use
     * @param logger Optional logger instance to use
     */
    constructor(configuration, eventManager, storageBackend, logger) {
        this.#configuration = configuration;
        this.#eventManager = eventManager;
        this.#storageBackend = storageBackend;
        this.#logger = logger;
    }
    /** @internal */
    getServicesIfSet() {
        return {
            configuration: this.#configuration,
            eventManager: this.#eventManager,
            storageBackend: this.#storageBackend,
            logger: this.#logger,
        };
    }
    getConfiguration() {
        if (!this.#configuration) {
            this.getLogger().debug('No configuration set, implicitly creating and using default Configuration.');
            this.#configuration = new Configuration();
        }
        return this.#configuration;
    }
    setConfiguration(configuration) {
        // Same instance, no need to do anything
        if (this.#configuration === configuration) {
            return;
        }
        // Already have a different configuration that was retrieved
        if (this.#configuration) {
            throw new ServiceConflictError('Configuration', configuration, this.#configuration);
        }
        this.#configuration = configuration;
    }
    getEventManager() {
        if (!this.#eventManager) {
            this.getLogger().debug('No event manager set, implicitly creating and using default LocalEventManager.');
            if (!this.#configuration) {
                this.getLogger().warning('Implicit creation of event manager will implicitly set configuration as side effect. ' +
                    'It is advised to explicitly first set the configuration instead.');
            }
            this.#eventManager = LocalEventManager.fromConfiguration(this.getConfiguration());
        }
        return this.#eventManager;
    }
    setEventManager(eventManager) {
        // Same instance, no need to do anything
        if (this.#eventManager === eventManager) {
            return;
        }
        // Already have a different event manager that was retrieved
        if (this.#eventManager) {
            throw new ServiceConflictError('EventManager', eventManager, this.#eventManager);
        }
        this.#eventManager = eventManager;
    }
    getStorageBackend() {
        if (!this.#storageBackend) {
            this.getLogger().debug('No storage backend set, implicitly creating and using the default storage backend ' +
                '(FileSystemStorageBackend when persistStorage is enabled, MemoryStorageBackend otherwise).');
            if (!this.#configuration) {
                this.getLogger().warning('Implicit creation of storage backend will implicitly set configuration as side effect. ' +
                    'It is advised to explicitly first set the configuration instead.');
            }
            const configuration = this.getConfiguration();
            this.#storageBackend = configuration.persistStorage
                ? new FileSystemStorageBackend({
                    localDataDirectory: configuration.storageDir,
                    logger: this.getLogger().child({ prefix: 'FileSystemStorageBackend' }),
                })
                : new MemoryStorageBackend({
                    logger: this.getLogger().child({ prefix: 'MemoryStorageBackend' }),
                });
        }
        return this.#storageBackend;
    }
    setStorageBackend(storageBackend) {
        // Same instance, no need to do anything
        if (this.#storageBackend === storageBackend) {
            return;
        }
        // Already have a different storage backend that was retrieved
        if (this.#storageBackend) {
            throw new ServiceConflictError('StorageBackend', storageBackend, this.#storageBackend);
        }
        this.#storageBackend = storageBackend;
    }
    getLogger() {
        if (!this.#logger) {
            this.#logger = new ApifyLogAdapter(log);
        }
        return this.#logger;
    }
    setLogger(logger) {
        if (this.#logger === logger) {
            return;
        }
        if (this.#logger) {
            throw new ServiceConflictError('Logger', logger, this.#logger);
        }
        this.#logger = logger;
    }
    getChildLog(prefix) {
        return this.getLogger().child({ prefix });
    }
    getStorageInstanceManager() {
        if (!ServiceLocator.#storageInstanceManager) {
            ServiceLocator.#storageInstanceManager = new StorageInstanceManager();
        }
        return ServiceLocator.#storageInstanceManager;
    }
    reset() {
        this.#configuration = undefined;
        this.#eventManager = undefined;
        this.#storageBackend = undefined;
        this.#logger = undefined;
        ServiceLocator.#storageInstanceManager?.clearCache();
        ServiceLocator.#storageInstanceManager = undefined;
    }
}
/**
 * Used as the default service provider when crawlers don't specify custom services.
 */
const globalServiceLocator = new ServiceLocator();
const serviceLocatorStorage = new AsyncLocalStorage();
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
export function bindMethodsToServiceLocator(serviceLocator, target) {
    let proto = Object.getPrototypeOf(target);
    const seenKeys = new Set();
    while (proto !== null && proto !== Object.prototype) {
        const propertyKeys = [...Object.getOwnPropertyNames(proto), ...Object.getOwnPropertySymbols(proto)];
        for (const propertyKey of propertyKeys) {
            // The chain is walked derived-first, so the first occurrence of a key is the one dynamic
            // dispatch would pick — a subclass override must not be clobbered by its base version.
            if (seenKeys.has(propertyKey))
                continue;
            seenKeys.add(propertyKey);
            const descriptor = Object.getOwnPropertyDescriptor(proto, propertyKey);
            // We use property descriptors rather than accessing target[propertyKey] directly,
            // because that would trigger getters and cause unwanted side effects.
            // Skip getters, setters, and constructors — only wrap regular methods.
            if (propertyKey === 'constructor' ||
                !descriptor ||
                descriptor.get ||
                descriptor.set ||
                typeof descriptor.value !== 'function')
                continue;
            const original = descriptor.value;
            target[propertyKey] = (...args) => {
                return serviceLocatorStorage.run(serviceLocator, () => {
                    return original.apply(target, args);
                });
            };
        }
        proto = Object.getPrototypeOf(proto);
    }
    let previousStore;
    return {
        run: (fn) => serviceLocatorStorage.run(serviceLocator, fn),
        enterScope: () => {
            previousStore = serviceLocatorStorage.getStore();
            serviceLocatorStorage.enterWith(serviceLocator);
        },
        exitScope: () => {
            serviceLocatorStorage.enterWith(previousStore); // casting to any so that `undefined` is accepted - this "unsets" the AsyncLocalStorage
        },
    };
}
export const serviceLocator = new Proxy({}, {
    get(_target, prop) {
        const active = serviceLocatorStorage.getStore() ?? globalServiceLocator;
        const value = Reflect.get(active, prop, active);
        if (typeof value === 'function') {
            return value.bind(active);
        }
        return value;
    },
    set(_target, prop) {
        throw new TypeError(`Cannot set property '${String(prop)}' on serviceLocator directly. Use the setter methods (e.g. setConfiguration(), setStorageBackend()) instead.`);
    },
});

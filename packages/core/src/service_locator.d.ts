import type { StorageBackend } from '@crawlee/types';
import { Configuration } from './configuration.js';
import type { EventManager } from './events/event_manager.js';
import type { CrawleeLogger } from './log.js';
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
     * Returns the currently set services without triggering the implicit creation of defaults.
     * Used to inherit already-materialized services into crawler-scoped service locators.
     * @internal
     */
    getServicesIfSet(): {
        configuration?: Configuration;
        eventManager?: EventManager;
        storageBackend?: StorageBackend;
        logger?: CrawleeLogger;
    };
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
 *     configuration: new Configuration({ ... }),           // custom configuration
 *     storageBackend: new MemoryStorageBackend(),          // custom storage
 *     eventManager: LocalEventManager.fromConfiguration(), // custom events
 * });
 * // Crawler has its own isolated ServiceLocator instance
 * ```
 */
export declare class ServiceLocator implements ServiceLocatorInterface {
    #private;
    /**
     * Creates a new ServiceLocator instance.
     *
     * @param configuration Optional configuration instance to use
     * @param eventManager Optional event manager instance to use
     * @param storageBackend Optional storage backend instance to use
     * @param logger Optional logger instance to use
     */
    constructor(configuration?: Configuration, eventManager?: EventManager, storageBackend?: StorageBackend, logger?: CrawleeLogger);
    /** @internal */
    getServicesIfSet(): {
        configuration?: Configuration;
        eventManager?: EventManager;
        storageBackend?: StorageBackend;
        logger?: CrawleeLogger;
    };
    getConfiguration(): Configuration;
    setConfiguration(configuration: Configuration): void;
    getEventManager(): EventManager;
    setEventManager(eventManager: EventManager): void;
    getStorageBackend(): StorageBackend;
    setStorageBackend(storageBackend: StorageBackend): void;
    getLogger(): CrawleeLogger;
    setLogger(logger: CrawleeLogger): void;
    getChildLog(prefix: string): CrawleeLogger;
    getStorageInstanceManager(): StorageInstanceManager;
    reset(): void;
}
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
export declare function bindMethodsToServiceLocator(serviceLocator: ServiceLocator, target: {}): {
    run: <T>(fn: () => T) => T;
    enterScope: () => void;
    exitScope: () => void;
};
export declare const serviceLocator: ServiceLocatorInterface;
export {};

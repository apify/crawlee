import crypto from 'node:crypto';
import { Configuration } from '../configuration.js';
import { serviceLocator } from '../service_locator.js';
import { KeyValueStore } from './key_value_store.js';
export async function purgeDefaultStorages(configurationOrOptions, storageBackend) {
    const options = configurationOrOptions instanceof Configuration
        ? {
            storageBackend,
            configuration: configurationOrOptions,
        }
        : (configurationOrOptions ?? {});
    const { configuration = serviceLocator.getConfiguration(), onlyPurgeOnce = false } = options;
    ({ storageBackend = serviceLocator.getStorageBackend() } = options);
    const casted = storageBackend;
    const runPurge = async () => {
        try {
            await casted.purge?.();
        }
        catch (e) {
            casted.__purged = undefined;
            throw e;
        }
    };
    // if `onlyPurgeOnce` is true, will purge anytime this function is called, otherwise - only on start
    if (!onlyPurgeOnce || (configuration.purgeOnStart && !casted.__purged)) {
        casted.__purged = runPurge();
    }
    await casted.__purged;
}
/**
 * Easily create and manage state values. All state values are automatically persisted.
 *
 * Values can be modified by simply using the assignment operator.
 *
 * @param name The name of the store to use.
 * @param defaultValue If the store does not yet have a value in it, the value will be initialized with the `defaultValue` you provide.
 * @param options An optional object parameter where a custom `keyValueStoreName` and `configuration` can be passed in.
 */
export async function useState(name, defaultValue = {}, options) {
    const kvStore = await KeyValueStore.open(options?.keyValueStoreName ? { name: options.keyValueStoreName } : null, {
        configuration: options?.configuration || serviceLocator.getConfiguration(),
    });
    return kvStore.getAutoSavedValue(name || 'CRAWLEE_GLOBAL_STATE', defaultValue);
}
/**
 * Helper function that creates ID from uniqueKey for local emulation of request queue.
 * It's also used for local cache of remote request queue.
 *
 * This function may not exactly match how requestId is created server side.
 * So we never pass requestId created by this to server and use it only for local cache.
 *
 * @internal
 */
export function getRequestId(uniqueKey) {
    const str = crypto.createHash('sha256').update(uniqueKey).digest('base64').replace(/[+/=]/g, '');
    return str.slice(0, 15);
}
/**
 * When requesting queue head we always fetch requestsInProgressCount * QUERY_HEAD_BUFFER number of requests.
 * @internal
 */
export const QUERY_HEAD_MIN_LENGTH = 100;
/**
 * Indicates how long it usually takes for the underlying storage to propagate all writes
 * to be available to subsequent reads.
 * @internal
 */
export const STORAGE_CONSISTENCY_DELAY_MILLIS = 3000;
/** @internal */
export const QUERY_HEAD_BUFFER = 3;
/**
 * If queue was modified (request added/updated/deleted) before more than API_PROCESSED_REQUESTS_DELAY_MILLIS
 * then we assume the get head operation to be consistent.
 * @internal
 */
export const API_PROCESSED_REQUESTS_DELAY_MILLIS = 10_000;
/**
 * How many times we try to get queue head with queueModifiedAt older than API_PROCESSED_REQUESTS_DELAY_MILLIS.
 * @internal
 */
export const MAX_QUERIES_FOR_CONSISTENCY = 6;
/**
 * Creates an object that is both an `AsyncIterable<TItem>` (for `for await...of`)
 * and a `Promise<TItem[]>` (for `await`) from a single async page generator.
 *
 * - `await result` drains all pages from a fresh generator and returns every
 *   item as a flat array.
 * - `for await (const item of result)` streams all items across all pages,
 *   yielding them one by one without buffering everything in memory.
 *
 * Each usage path creates its own generator instance, so `await` and
 * `for await...of` never interfere with each other.
 *
 * @internal
 */
export function createDualIterable(options) {
    const { createPages, extractItems } = options;
    let cached = null;
    function getOrCreate() {
        if (!cached) {
            cached = (async () => {
                const items = [];
                for await (const page of createPages()) {
                    items.push(...extractItems(page));
                }
                return items;
            })();
        }
        return cached;
    }
    async function* iterateAll() {
        for await (const page of createPages()) {
            yield* extractItems(page);
        }
    }
    const result = {
        [Symbol.asyncIterator]() {
            return iterateAll();
        },
        then(onfulfilled, onrejected) {
            return getOrCreate().then(onfulfilled, onrejected);
        },
        catch(onrejected) {
            return getOrCreate().catch(onrejected);
        },
        finally(onfinally) {
            return getOrCreate().finally(onfinally);
        },
        [Symbol.toStringTag]: 'DualIterable',
    };
    return result;
}

import { createHash } from 'node:crypto';

import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';

import defaultLog from '@apify/log';

import { REQUEST_ID_LENGTH } from './consts';

/**
 * Removes all properties with a null value
 * from the provided object.
 */
export function purgeNullsFromObject<T>(object: T): T {
    if (object && typeof object === 'object' && !Array.isArray(object)) {
        for (const [key, value] of Object.entries(object)) {
            if (value === null) Reflect.deleteProperty(object as Record<string, unknown>, key);
        }
    }

    return object;
}

/**
 * Creates a standard request ID (same as Platform).
 */
export function uniqueKeyToRequestId(uniqueKey: string): string {
    const str = createHash('sha256')
        .update(uniqueKey)
        .digest('base64')
        .replace(/(\+|\/|=)/g, '');

    return str.length > REQUEST_ID_LENGTH ? str.slice(0, REQUEST_ID_LENGTH) : str;
}

export function isBuffer(value: unknown): boolean {
    try {
        s.union(s.instance(Buffer), s.instance(ArrayBuffer), s.typedArray()).parse(value);

        return true;
    } catch {
        return false;
    }
}

export function isStream(value: any): boolean {
    return (
        typeof value === 'object' &&
        value &&
        ['on', 'pipe'].every((key) => key in value && typeof value[key] === 'function')
    );
}

export const memoryStorageLog = defaultLog.child({ prefix: 'MemoryStorage' });

export type BackgroundHandlerReceivedMessage = BackgroundHandlerUpdateMetadataMessage;

export type BackgroundHandlerUpdateMetadataMessage =
    | MetadataUpdate<'datasets', storage.DatasetInfo>
    | MetadataUpdate<'keyValueStores', storage.KeyValueStoreInfo>
    | MetadataUpdate<'requestQueues', storage.RequestQueueInfo>;

type EntityType = 'datasets' | 'keyValueStores' | 'requestQueues';

interface MetadataUpdate<Type extends EntityType, DataType> {
    entityType: Type;
    id: string;
    action: 'update-metadata';
    entityDirectory: string;
    data: DataType;
    writeMetadata: boolean;
    persistStorage: boolean;
}

/**
 * Creates a hybrid Promise + AsyncIterable for offset-based pagination (Dataset.listItems).
 *
 * The returned object can be:
 * - Awaited directly to get the first page (backward compatible)
 * - Used with `for await...of` to iterate through all items
 */
export function createPaginatedList<Data>(
    getPage: (offset: number, limit: number) => Promise<storage.PaginatedList<Data>>,
    options: { offset?: number; limit?: number } = {},
): AsyncIterable<Data> & Promise<storage.PaginatedList<Data>> {
    const offset = options.offset ?? 0;

    // Immediately fetch the first page (Infinity is used when no limit, gets clamped by Math.min downstream)
    const firstPagePromise = getPage(offset, options.limit ?? Infinity);

    async function* asyncGenerator(): AsyncGenerator<Data> {
        let currentPage = await firstPagePromise;
        yield* currentPage.items;

        const limit = Math.min(options.limit ?? currentPage.total, currentPage.total);
        let currentOffset = offset + currentPage.items.length;
        let remainingItems = Math.min(currentPage.total - offset, limit) - currentPage.items.length;

        while (
            currentPage.items.length > 0 && // Continue only if at least some items were returned in the last page.
            remainingItems > 0
        ) {
            currentPage = await getPage(currentOffset, remainingItems);
            yield* currentPage.items;
            currentOffset += currentPage.items.length;
            remainingItems -= currentPage.items.length;
        }
    }

    return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
        value: asyncGenerator,
    }) as AsyncIterable<Data> & Promise<storage.PaginatedList<Data>>;
}

/**
 * Creates a hybrid Promise + AsyncIterable for cursor-based pagination (KeyValueStore.listKeys).
 *
 * The returned object can be:
 * - Awaited directly to get the first page (backward compatible)
 * - Used with `for await...of` to iterate through all keys
 */
export function createKeyList(
    getPage: (exclusiveStartKey?: string) => Promise<storage.KeyValueStoreClientListData>,
    options: { exclusiveStartKey?: string; limit?: number } = {},
): AsyncIterable<storage.KeyValueStoreItemData> & Promise<storage.KeyValueStoreClientListData> {
    // Immediately fetch the first page
    const firstPagePromise = getPage(options.exclusiveStartKey);

    async function* asyncGenerator(): AsyncGenerator<storage.KeyValueStoreItemData> {
        let currentPage = await firstPagePromise;
        yield* currentPage.items;

        let remainingItems = options.limit ? options.limit - currentPage.items.length : undefined;

        while (
            currentPage.items.length > 0 &&
            currentPage.nextExclusiveStartKey !== undefined &&
            (remainingItems === undefined || remainingItems > 0)
        ) {
            currentPage = await getPage(currentPage.nextExclusiveStartKey);
            yield* currentPage.items;
            if (remainingItems !== undefined) {
                remainingItems -= currentPage.items.length;
            }
        }
    }

    return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
        value: asyncGenerator,
    }) as AsyncIterable<storage.KeyValueStoreItemData> & Promise<storage.KeyValueStoreClientListData>;
}

/**
 * Creates a hybrid Promise + AsyncIterable that yields only key strings (KeyValueStore.keys).
 *
 * The returned object can be:
 * - Awaited directly to get the first page (backward compatible)
 * - Used with `for await...of` to iterate through all key strings
 */
export function createKeyStringList(
    getPage: (exclusiveStartKey?: string) => Promise<storage.KeyValueStoreClientListData>,
    options: { exclusiveStartKey?: string; limit?: number } = {},
): AsyncIterable<string> & Promise<storage.KeyValueStoreClientListData> {
    // Immediately fetch the first page
    const firstPagePromise = getPage(options.exclusiveStartKey);

    async function* asyncGenerator(): AsyncGenerator<string> {
        let currentPage = await firstPagePromise;
        for (const item of currentPage.items) {
            yield item.key;
        }

        let remainingItems = options.limit ? options.limit - currentPage.items.length : undefined;

        while (
            currentPage.items.length > 0 &&
            currentPage.nextExclusiveStartKey !== undefined &&
            (remainingItems === undefined || remainingItems > 0)
        ) {
            currentPage = await getPage(currentPage.nextExclusiveStartKey);
            for (const item of currentPage.items) {
                yield item.key;
            }
            if (remainingItems !== undefined) {
                remainingItems -= currentPage.items.length;
            }
        }
    }

    return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
        value: asyncGenerator,
    }) as AsyncIterable<string> & Promise<storage.KeyValueStoreClientListData>;
}

/**
 * Creates a hybrid Promise + AsyncIterable for offset-based pagination with index-value entries (Dataset.listEntries).
 *
 * The returned object can be:
 * - Awaited directly to get the first page with [index, item] tuples (backward compatible)
 * - Used with `for await...of` to iterate through all entries as [index, item] tuples
 */
export function createPaginatedEntryList<Data>(
    getPage: (offset: number, limit: number) => Promise<storage.PaginatedList<Data>>,
    options: { offset?: number; limit?: number } = {},
): AsyncIterable<[number, Data]> & Promise<storage.PaginatedList<[number, Data]>> {
    const offset = options.offset ?? 0;

    // Immediately fetch the first page and transform items to entries
    const firstPagePromise = getPage(offset, options.limit ?? Infinity).then((result) => ({
        ...result,
        items: result.items.map((item, i) => [offset + i, item] as [number, Data]),
    }));

    async function* asyncGenerator(): AsyncGenerator<[number, Data]> {
        let currentIndex = offset;
        for await (const item of createPaginatedList(getPage, options)) {
            yield [currentIndex++, item];
        }
    }

    return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
        value: asyncGenerator,
    }) as AsyncIterable<[number, Data]> & Promise<storage.PaginatedList<[number, Data]>>;
}

/**
 * Creates an object that acts as both a lazy Promise and an AsyncIterable.
 * - When awaited, it triggers `promiseFactory` (bulk fetch, cached after first call).
 * - When iterated with `for await...of`, it uses `iteratorFactory` (streaming, no bulk fetch).
 */
export function createLazyIterablePromise<TPromise, TElement>(
    promiseFactory: () => Promise<TPromise>,
    iteratorFactory: () => AsyncGenerator<TElement>,
): AsyncIterable<TElement> & Promise<TPromise> {
    let cached: Promise<TPromise> | null = null;
    function getOrCreate(): Promise<TPromise> {
        if (!cached) {
            cached = promiseFactory();
        }
        return cached;
    }

    const result = {
        then<TResult1 = TPromise, TResult2 = never>(
            onfulfilled?: ((value: TPromise) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
            return getOrCreate().then(onfulfilled, onrejected);
        },
        catch<TResult = never>(
            onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
        ): Promise<TPromise | TResult> {
            return getOrCreate().catch(onrejected);
        },
        finally(onfinally?: (() => void) | null): Promise<TPromise> {
            return getOrCreate().finally(onfinally);
        },
        [Symbol.asyncIterator]: iteratorFactory,
        [Symbol.toStringTag]: 'Promise' as const,
    };

    return result as AsyncIterable<TElement> & Promise<TPromise>;
}

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
    const initialOffset = options.offset ?? 0;
    const requestedLimit = options.limit;

    // Immediately fetch the first page
    const firstPagePromise = getPage(initialOffset, requestedLimit ?? Infinity);

    async function* asyncGenerator(): AsyncGenerator<Data> {
        const firstPage = await firstPagePromise;
        yield* firstPage.items;

        // Calculate how many items we still need to fetch
        const maxItems = requestedLimit ?? firstPage.total;
        let fetchedCount = firstPage.items.length;
        let currentOffset = initialOffset + firstPage.count;

        while (fetchedCount < maxItems && currentOffset < firstPage.total) {
            const remainingItems = maxItems - fetchedCount;
            const page = await getPage(currentOffset, remainingItems);

            if (page.items.length === 0) break;

            yield* page.items;
            fetchedCount += page.items.length;
            currentOffset += page.count;
        }
    }

    return Object.defineProperty(firstPagePromise, Symbol.asyncIterator, {
        value: asyncGenerator,
        writable: false,
        enumerable: false,
        configurable: false,
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
        writable: false,
        enumerable: false,
        configurable: false,
    }) as AsyncIterable<storage.KeyValueStoreItemData> & Promise<storage.KeyValueStoreClientListData>;
}

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

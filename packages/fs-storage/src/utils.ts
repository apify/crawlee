import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

import type * as storage from '@crawlee/types';
import { isBuffer, isStream, toBuffer } from '@crawlee/utils';

import { REQUEST_ID_LENGTH } from './consts.js';

/**
 * Resolves `segment` against `baseDirectory` and ensures the result stays within `baseDirectory`.
 * Storage names and record keys are used as filesystem path components, so a value containing `..`
 * or an absolute path could otherwise escape the intended directory.
 */
export function resolveWithinDirectory(baseDirectory: string, segment: string): string {
    const base = resolve(baseDirectory);
    const resolved = resolve(base, segment);

    if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) {
        throw new Error(
            `"${segment}" is not allowed because it would resolve outside of the storage directory. ` +
                `Storage names and record keys must not contain path traversal segments ("..") or absolute paths.`,
        );
    }

    return resolved;
}

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

export { isBuffer, isStream, toBuffer };

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
}

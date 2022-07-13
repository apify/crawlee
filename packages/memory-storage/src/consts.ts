/**
 * Length of id property of a Request instance in characters.
 */
export const REQUEST_ID_LENGTH = 15;

/**
 * Types of all emulated storages (currently used for warning messages only).
 */
export enum StorageTypes {
    RequestQueue = 'Request queue',
    KeyValueStore = 'Key-value store',
    Dataset = 'Dataset',
};

/**
 * Except in dataset items, the default limit for API results is 1000.
 */
export const DEFAULT_API_PARAM_LIMIT = 1000;

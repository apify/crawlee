/**
 * @param {string} dirName
 */
export function getStorage(dirName: string): string;
/**
 * @param {string} dirName
 */
export function getStats(dirName: string): Promise<any>;
/**
 * @param {string | URL} url
 */
export function getActorTestDir(url: string | URL): string;
export function pushActor(client: any, dirName: any): Promise<any>;
export function startActorOnPlatform(client: any, id: any, input: any, inputContentType?: string, memory?: number): Promise<any>;
/**
 * @param {string} dirName
 * @param {number} [memory=4096]
 */
export function runActor(dirName: string, memory?: number): Promise<{
    stats: any;
    datasetItems: any[];
    defaultKeyValueStoreItems: {
        name: string;
        raw: Buffer<ArrayBufferLike>;
    }[] | undefined;
    getKeyValueStoreItems: ((name: any) => Promise<{
        name: string;
        raw: Buffer<ArrayBufferLike>;
    }[] | undefined>) | ((name?: string) => Promise<{
        name: string;
        raw: NonSharedBuffer;
    }[] | undefined>);
}>;
/**
 * @param {string} dirName
 */
export function clearPackages(dirName: string): Promise<void>;
/**
 * @param {string} dirName
 */
export function clearStorage(dirName: string): Promise<void>;
export function getApifyToken(): Promise<any>;
/**
 * @param {string} dirName
 */
export function getDatasetItems(dirName: string): Promise<any[]>;
/**
 * Gets all items in the local key-value store
 * @param {string} dirName
 * @param {string} kvName
 */
export function getLocalKeyValueStoreItems(dirName: string, kvName: string): Promise<{
    name: string;
    raw: NonSharedBuffer;
}[] | undefined>;
/**
 * @param {string} dirName
 */
export function initialize(dirName: string): Promise<void>;
/**
 * @param {boolean} bool
 * @param {string} message
 */
export function expect(bool: boolean, message: string): Promise<void>;
/**
 * @param {string} reason
 */
export function skipTest(reason: string): Promise<void>;
/**
 * @param {any[]} items
 * @param {string[]} schema
 */
export function validateDataset(items: any[], schema?: string[]): boolean;
/**
 * @param {any} obj the object to search
 * @param {string} keyName the key to search for
 * @returns {boolean}
 */
export function hasNestedKey(obj: any, keyName: string): boolean;
export const SKIPPED_TEST_CLOSE_CODE: 404;
/** @type {Record<string, (text: string) => string>} */
export const colors: Record<string, (text: string) => string>;

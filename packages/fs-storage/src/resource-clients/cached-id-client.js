/**
 * Shared base for the file-system resource backends. The native id is read once from the native
 * metadata at construction time (in each backend's `create()`), so the synchronous `id` getter —
 * required by `FileSystemStorageBackend.storageExists` and the cache lookups — does not have to await.
 */
export class CachedIdClient {
    /** The storage id assigned by the native client. Set once by the subclass `create()`. */
    cachedId;
    /** The storage id assigned by the native client. */
    get id() {
        return this.cachedId;
    }
}

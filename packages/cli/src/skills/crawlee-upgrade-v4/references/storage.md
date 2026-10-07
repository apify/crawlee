# Storage

## Transactions and frontends

Each request buffers storage writes from hooks, context extension and handler execution until the handler succeeds. Failed handlers discard those writes. Reads see the current handler's writes, but other handlers cannot see them before commit. Use shared `useState()` for cross-handler communication when appropriate; its mutations and `getAutoSavedValue()` mutations are not transactional and are never rolled back.

Queue additions default to immediate `writeThrough`, with unique-key deduplication on retry. Use `transactionalStorage: { requestQueue: 'deferred' }` only when strict deferred enqueueing is intended. Cross-storage commits are at-least-once; partial failures may reapply already committed writes on retry.

`pushData()` records a write; a surrounding catch cannot catch its later backend commit error. Register `afterStorageCommit()` for handling commit success or errors and for updating counters tied to committed results. An error thrown from that callback replaces the commit error.

Stream values cannot be buffered, and `drop()`, `purge()` and queue-processing internals cannot be rolled back. These throw in a handler unless performed through `withDirectStorageAccess()`. Use that helper only for deliberate immediate side effects:

```ts
await withDirectStorageAccess(async () => {
    await store.setValue('video', stream, { contentType: 'video/mp4' });
});
```

`checkStorageAccess` and `withCheckedStorageAccess` are removed. `transactionalStorage: false` disables buffering except in AdaptivePlaywrightCrawler. Do not disable transactions globally merely to hide a migration error. KVS iteration inside a handler lists buffered keys first.

`storageObject` is removed; access `id` and `name` directly, or dataset metadata through `getInfo()`. `KeyValueStore.getPublicUrl()` is async. Storage `.open()` accepts a string as before, or `{ id?, name? }` to disambiguate. Context storage identifiers accept the object too; existing strings need no rewrite.

`Dataset.listItems()` becomes `getData()` for one paginated page, or `values()` for all items. `for await` iterates `values()` incrementally; awaiting it collects an array. Dataset `entries()` gives index/item tuples. KVS `keys`, `values` and `entries` have the same dual-iterable model. KVS iterator options lose `exclusiveStartKey` and `collection`, leaving `prefix`. `RecordOptions` retains only `contentType`.

## Preserve disk persistence

`@crawlee/memory-storage` is removed. The old `MemoryStorage` persisted by default, so blindly renaming it to `MemoryStorageBackend` loses persistence:

- Use `FileSystemStorageBackend` from `@crawlee/fs-storage` to preserve disk-backed behavior. It accepts `localDataDirectory` and always persists.
- Use `MemoryStorageBackend` from `@crawlee/core` for the old `persistStorage: false` behavior. It never touches disk and has no directory, persistence or metadata options.

Both are re-exported from `crawlee`. The implicit default still persists under `./storage` when configuration `persistStorage` is true, and uses memory otherwise. Preserve `CRAWLEE_STORAGE_DIR` and `CRAWLEE_PERSIST_STORAGE` choices.

FileSystemStorageBackend needs no explicit initialization; its async factories open storage on demand. It has no async-disposal hook. A crawler run calls the active backend's optional `teardown()` on exit. When using the backend outside a crawler, call `teardown()` at the end to persist open request-queue state.

Remove `writeMetadata`; filesystem storage always writes metadata sidecars. In-memory queues have no expiring cross-process request locks; requests stay in progress until handled or reclaimed, and expected-processing-time configuration does nothing there. Disk queues retain expiring locks.

Hand-placed KVS files remain readable through logical keys or filenames, but extensionless files return application/octet-stream. Malformed bare JSON now raises a parse error. Listing bare files exposes their real filename, such as INPUT.json; tracked records take precedence over corresponding bare files.

## Custom backend contract

`StorageClient` becomes `StorageBackend`. Replace collection clients and synchronous getters with three async factories taking `StorageIdentifier`: `createDatasetBackend`, `createKeyValueStoreBackend`, `createRequestQueueBackend`. Each opens or creates a storage. Four classes now suffice: the backend plus one sub-backend per storage kind.

| v3 backend/client method | v4 |
| --- | --- |
| `get()` | `getMetadata()` |
| `update()` | Removed |
| `delete()` | `drop()` |
| Dataset `pushItems()` | `pushData(items: Data[])` |
| Dataset `listItems()` | `getData()` returning one PaginatedList page |
| KVS `getRecord()` / `setRecord()` / `deleteRecord()` | `getValue()` / `setValue()` / `deleteValue()` |
| KVS `getRecordPublicUrl()` | `getPublicUrl()` |
| Queue `addRequest()` / `batchAddRequests()` | `addBatchOfRequests()` |
| Queue `getRequest(id)` | `getRequest(uniqueKey)` |
| Queue `updateRequest()` | `markRequestAsHandled()` / `reclaimRequest()` |
| Queue `listHead()` | `fetchNextRequest()` |

Implement `purge()` and queue backend `isEmpty()` / `isFinished()`. Lock acquisition, prolonging and deletion are backend internals; frontend distributed-lock methods and `deleteRequest()` disappear. Frontend queue `requestLockSecs`, `internalTimeoutMillis`, `clientKey` and `timeoutSecs` disappear. Outside a crawler, use `setExpectedRequestProcessingTimeSecs()` when processing may exceed the disk queue's default three-minute lock.

Dataset backend iteration/export helpers and KVS backend iteration helpers move to storage frontends. KVS `listKeys()` returns a `KeyValueStoreListKeysResult` page. Backends transport bytes; serialization lives in KVS frontend `serializeValue` / `parseValue`, replacing `maybeStringify`, `checkAndSerialize` and `chunkBySize`.

Storage frontends receive `{ metadata, backend }` internally; applications should open them with `.open()`. Backend metadata drops platform fields `actId`, `actRunId`, `userId`, queue `expireAt` / `hadMultipleClients`, and storage `stats`. Read platform metadata and enumerate all storages through the Apify API client if still needed.

Collection interfaces and data types disappear. The old client-update, record-get/options, queue-head, locking and storage-stats types disappear too. `KeyValueStoreClientListOptions` becomes `KeyValueStoreListKeysOptions`; `Create*BackendOptions` aliases become `StorageIdentifier`. Check the implemented v4 backend interfaces when compiler errors identify one of these types.

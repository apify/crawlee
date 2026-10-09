# Storage

## Transactions and frontends

Storage writes in hooks, context extension and handlers buffer until success; failures discard them. Pending writes are visible only to the current handler. `useState()` and `getAutoSavedValue()` mutations remain shared and nontransactional: they are never rolled back.

Queue additions default to immediate `writeThrough`, with unique-key deduplication on retry. Use `transactionalStorage: { requestQueue: 'deferred' }` for deferred enqueueing. Cross-storage commits are at-least-once; partial failures may reapply already committed writes on retry.

A catch around `pushData()` cannot catch later commit errors. Use `afterStorageCommit()` for commit outcomes and committed-result counters. Throwing there replaces the commit error.

Streams, `drop()`, `purge()` and queue processing cannot be buffered/rolled back. In handlers they require deliberate immediate access:

```ts
await withDirectStorageAccess(async () => {
    await store.setValue('video', stream, { contentType: 'video/mp4' });
});
```

`checkStorageAccess` and `withCheckedStorageAccess` are removed. `transactionalStorage: false` disables buffering except in AdaptivePlaywrightCrawler. Do not disable transactions globally merely to hide a migration error. KVS iteration inside a handler lists buffered keys first.

`storageObject` is removed; access `id` and `name` directly, or dataset metadata through `getInfo()`. `KeyValueStore.getPublicUrl()` is async. Storage `.open()` accepts a string as before, or `{ id?, name? }` to disambiguate. Context identifiers also accept objects.

`Dataset.listItems()` becomes `getData()` for one paginated page, or `values()` for all items. `for await` iterates `values()` incrementally; awaiting it collects an array. Dataset `entries()` gives index/item tuples. KVS `keys`, `values` and `entries` work likewise. KVS iterator options lose `exclusiveStartKey` and `collection`, leaving `prefix`. `RecordOptions` retains only `contentType`.

## Preserve disk persistence

`@crawlee/memory-storage` is removed. The old `MemoryStorage` persisted by default, so blindly renaming it to `MemoryStorageBackend` loses persistence:

- Use `FileSystemStorageBackend` from `@crawlee/fs-storage` to preserve disk-backed behavior. It accepts `localDataDirectory` and always persists.
- Use `MemoryStorageBackend` from `@crawlee/core` for the old `persistStorage: false` behavior. It never touches disk and has no directory, persistence or metadata options.

Both are re-exported by `crawlee`. The default uses `./storage` when `persistStorage` is true, memory otherwise. Preserve `CRAWLEE_STORAGE_DIR` / `CRAWLEE_PERSIST_STORAGE`.

FileSystemStorageBackend needs no initialization and has no async-disposal hook. Crawlers call backend `teardown()` on exit; standalone users must call it to persist open queue state.

Remove `writeMetadata`; filesystem storage always writes metadata sidecars. Memory queues retain in-progress requests until handled/reclaimed; lock timeouts do nothing. Disk queues retain expiring locks.

## Input and existing KVS files

`KeyValueStore.getInput()`, `Configuration.inputKey` and `CRAWLEE_INPUT_KEY` are removed. Use `Actor.getInput()` for Actor input keys, secrets and schema defaults. Plain Crawlee has no reserved input key and purges the entire default KVS on start, including `INPUT`. Preserve local input explicitly; replacing the call with `getValue('INPUT')` does not prevent purging.

Files without metadata sidecars are adopted under literal filenames: bare `aaa.json` needs `getValue('aaa.json')`, not `getValue('aaa')`. Dotfiles are skipped. Adoption leaves bytes unchanged; JSON files get JSON content type, others octet-stream. Malformed JSON fails on read.

SDK `ApifyFileSystemStorageBackend` instead adopts bare `INPUT` or `INPUT.json` as `INPUT` in the default store and preserves it during purge; `ACTOR_INPUT_KEY` is respected. If both bare files exist, opening fails. `INPUT.txt` and `INPUT.bin` are ordinary records now; rename legacy Actor input to `INPUT.json` or extensionless `INPUT`. Outside the default store, even `INPUT.json` keeps its filename as the key.

Custom filesystem backends can control adoption through `keyValueStoreAdoptionCandidates` and input preservation through `purgeKeyValueStore`. Plain Crawlee does neither.

## Custom backend contract

`StorageClient` becomes `StorageBackend`. Replace collection clients and synchronous getters with three async factories taking `StorageIdentifier`: `createDatasetBackend`, `createKeyValueStoreBackend`, `createRequestQueueBackend`.

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

Implement `purge()` and queue backend `isEmpty()` / `isFinished()`. `isEmpty()` means nothing fetchable; `isFinished()` additionally requires no in-progress requests, including other clients' locks. Empty `fetchNextRequest()` and no-op mark/reclaim calls return `undefined`, not `null`.

Lock acquisition and deletion are backend internals; frontend distributed-lock methods and `deleteRequest()` disappear. A locking backend can implement `extendRequestProcessingTimeSecs(requestId, secs)` for per-request extensions from `context.extendTimeout()`. Frontend queue `requestLockSecs`, `internalTimeoutMillis`, `clientKey` and `timeoutSecs` disappear. Standalone processing beyond the default three-minute disk lock needs `setExpectedRequestProcessingTimeSecs()`. Remove the obsolete `experiments: { requestLocking: ... }` crawler option and `CrawlerExperiments` type.

Dataset backend iteration/export helpers and KVS backend iteration helpers move to storage frontends. KVS `listKeys()` returns a `KeyValueStoreListKeysResult` page. Backends transport bytes; serialization lives in KVS frontend `serializeValue` / `parseValue`, replacing `maybeStringify`, `checkAndSerialize` and `chunkBySize`.

Storage frontends receive `{ metadata, backend }` internally; applications should open them with `.open()`. Backend metadata drops platform fields `actId`, `actRunId`, `userId`, queue `expireAt` / `hadMultipleClients`, and storage `stats`. Read platform metadata and enumerate all storages through the Apify API client if still needed.

`DatasetOptions`, `KeyValueStoreOptions` and `RequestQueueOptions` are internal constructor types. `Dataset.backend` is private, `id` and `name` are readonly, and `Dataset.log` is removed. Use frontend methods and your own logger.

Collection, client-update, record-get/options, queue-head, locking and storage-stats types disappear. `KeyValueStoreClientListOptions` becomes `KeyValueStoreListKeysOptions`.

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

## Input and existing KVS files

`KeyValueStore.getInput()`, `Configuration.inputKey` and `CRAWLEE_INPUT_KEY` are removed. In Actor projects use `Actor.getInput()` from `apify`, which handles the platform input key, secrets and schema defaults. Plain Crawlee has no reserved input key and purges the entire default KVS on start, including `INPUT`. Preserve required local input explicitly; do not assume that moving a call to `getValue('INPUT')` preserves the old behavior.

Keys are literal: `aaa` and `aaa.json` are distinct. On opening a filesystem store, files without metadata sidecars are adopted as records under their filenames. A bare `aaa.json` is read as `getValue('aaa.json')`, not `getValue('aaa')`. Dotfiles are skipped. Adoption writes metadata without changing the value bytes. JSON files get `application/json; charset=utf-8`; other files get `application/octet-stream`. Malformed JSON raises a parse error when read.

The Apify SDK's `ApifyFileSystemStorageBackend` supplies the platform-specific exception: in the default store it adopts bare `INPUT` or `INPUT.json` under the key `INPUT`, and does the same for `ACTOR_INPUT_KEY`. It preserves that input during purge. If both bare files exist, opening fails rather than choosing one. `INPUT.txt` and `INPUT.bin` are ordinary records now; rename legacy Actor input to `INPUT.json` or extensionless `INPUT`. Outside the default store, even `INPUT.json` keeps its filename as the key.

Custom filesystem backends can control adoption through `keyValueStoreAdoptionCandidates` and input preservation through `purgeKeyValueStore`. Plain Crawlee does neither. Inspect existing files and their consumers before changing keys or purge settings.

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

Implement `purge()` and queue backend `isEmpty()` / `isFinished()`. `isEmpty()` means nothing is fetchable now; `isFinished()` also requires no in-progress requests, including those locked by other clients. Methods with no result return `undefined`, not `null`: this includes `fetchNextRequest()` and no-op `markRequestAsHandled()` / `reclaimRequest()` calls.

Lock acquisition and deletion are backend internals; frontend distributed-lock methods and `deleteRequest()` disappear. A locking backend can implement `extendRequestProcessingTimeSecs(requestId, secs)` for per-request extensions from `context.extendTimeout()`. Frontend queue `requestLockSecs`, `internalTimeoutMillis`, `clientKey` and `timeoutSecs` disappear. Outside a crawler, use `setExpectedRequestProcessingTimeSecs()` when processing may exceed the disk queue's default three-minute lock. Remove the obsolete `experiments: { requestLocking: ... }` crawler option and `CrawlerExperiments` type.

Dataset backend iteration/export helpers and KVS backend iteration helpers move to storage frontends. KVS `listKeys()` returns a `KeyValueStoreListKeysResult` page. Backends transport bytes; serialization lives in KVS frontend `serializeValue` / `parseValue`, replacing `maybeStringify`, `checkAndSerialize` and `chunkBySize`.

Storage frontends receive `{ metadata, backend }` internally; applications should open them with `.open()`. Backend metadata drops platform fields `actId`, `actRunId`, `userId`, queue `expireAt` / `hadMultipleClients`, and storage `stats`. Read platform metadata and enumerate all storages through the Apify API client if still needed.

`DatasetOptions`, `KeyValueStoreOptions` and `RequestQueueOptions` are internal constructor types. `Dataset.backend` is private, `id` and `name` are readonly, and `Dataset.log` is removed. Use frontend methods and your own logger.

Collection interfaces and data types disappear. The old client-update, record-get/options, queue-head, locking and storage-stats types disappear too. `KeyValueStoreClientListOptions` becomes `KeyValueStoreListKeysOptions`. Check the implemented v4 backend interfaces when compiler errors identify one of these types.

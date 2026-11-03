---
id: storage-backends
title: 'Upgrading to v4: storage backends'
sidebar_label: Storage backends
sidebar_position: 7
slug: /upgrading/upgrading-to-v4/storage-backends
---

Applies when you implement your own storage backend, or reach below the `Dataset`, `KeyValueStore` and `RequestQueue` frontends. This page is part of the [Upgrading to v4](./upgrading-v4.md) guide.

## `StorageBackend` interface simplified

The `StorageBackend` interface (from `@crawlee/types`, formerly named `StorageClient`) has been redesigned and simplified. A new storage backend now needs **4 classes** instead of the previous 7.

### What changed

The three **collection client** interfaces have been removed:

- `DatasetCollectionClient`
- `KeyValueStoreCollectionClient`
- `RequestQueueCollectionClient`

Along with their associated types (`DatasetCollectionData`, `DatasetCollectionClientOptions`, and the `Dataset` interface from `@crawlee/types`).

The `StorageBackend` interface changed from synchronous sub-client getters to **async factory methods**:

| Before (v3) | After (v4) |
|---|---|
| `client.dataset(id)` | `backend.createDatasetBackend({ id?, name? })` |
| `client.datasets().getOrCreate(name)` | _(absorbed into `createDatasetBackend`)_ |
| `client.keyValueStore(id)` | `backend.createKeyValueStoreBackend({ id?, name? })` |
| `client.keyValueStores().getOrCreate(name)` | _(absorbed into `createKeyValueStoreBackend`)_ |
| `client.requestQueue(id, opts)` | `backend.createRequestQueueBackend({ id?, name? })` |
| `client.requestQueues().getOrCreate(name)` | _(absorbed into `createRequestQueueBackend`)_ |

The sub-backend interfaces (`DatasetBackend`, `KeyValueStoreBackend`, `RequestQueueBackend`, formerly `DatasetClient` / `KeyValueStoreClient` / `RequestQueueClient`) have been simplified:

| Before (v3) | After (v4) |
|---|---|
| `get()` | `getMetadata()` |
| `update()` | Removed |
| `delete()` | `drop()` |
| _(n/a)_ | `purge()` (new — clears data, keeps storage) |

**`DatasetBackend`:**

| Before (v3) | After (v4) |
|---|---|
| `pushItems(items: Data \| Data[] \| string \| string[])` | `pushData(items: Data[])` |
| `listItems(options?)` (dual iterable) | `getData(options?)` (returns a single `PaginatedList` page) |
| `listEntries(options?)` | Removed (handled by `Dataset` frontend) |
| `downloadItems()` | Removed |

**`KeyValueStoreBackend`:**

| Before (v3) | After (v4) |
|---|---|
| `getRecord(key, options?)` | `getValue(key)` |
| `setRecord(record, options?)` | `setValue(record)` |
| `deleteRecord(key)` | `deleteValue(key)` |
| `getRecordPublicUrl(key)` | `getPublicUrl(key)` |
| `listKeys(options?)` → `KeyValueStoreClientListData` | `listKeys(options?)` → `KeyValueStoreListKeysResult` (a single self-describing page) |
| `keys()`, `values()`, `entries()` | Removed (handled by `KeyValueStore` frontend) |

**`RequestQueueBackend`:**

The request queue backend's surface was reshaped. The frontend-owned distributed-locking protocol (`listAndLockHead` → `prolongRequestLock` → `deleteRequestLock`) was removed. Queue-head and consistency bookkeeping are now internal concerns of the backend implementation.

| Before (v3) | After (v4) |
|---|---|
| `addRequest(request, opts?)` | `addBatchOfRequests([request], opts?)` |
| `batchAddRequests(requests, opts?)` | `addBatchOfRequests(requests, opts?)` |
| `getRequest(id)` | `getRequest(uniqueKey)` |
| `updateRequest(request, opts?)` | `markRequestAsHandled(request)` / `reclaimRequest(request, opts?)` |
| `listHead(opts?)` | `fetchNextRequest()` (returns a single request, marks it in progress) |
| `listAndLockHead(opts)` | Removed (locking is internal to the client) |
| `prolongRequestLock(id, opts)` | `extendRequestProcessingTimeSecs(requestId, secs)` (optional — per-request lock extension for locking backends; wired to `context.extendTimeout`) |
| `deleteRequestLock(id, opts?)` | Removed |
| `deleteRequest(id)` | Removed |
| _(n/a)_ | `isEmpty()` (new — `true` when no pending requests are left to fetch) |
| _(n/a)_ | `isFinished()` (new — `true` when no pending **and** no in-progress requests remain) |

The lifecycle is now: `fetchNextRequest()` hands out a pending request and marks it in progress; once processed, call `markRequestAsHandled(request)`; on failure call `reclaimRequest(request, { forefront? })` to return it to the queue.

Methods that may have "nothing" to return now consistently resolve to `undefined` rather than `null`. `fetchNextRequest()` resolves to `undefined` when there is nothing to fetch, and `markRequestAsHandled()` / `reclaimRequest()` resolve to `undefined` when the request is not something the backend is currently processing (a no-op, not an error). This matches the `undefined` already returned by `getRequest()`, `KeyValueStoreBackend.getValue()`, and `getPublicUrl()`, so the whole backend family uses a single "absent" sentinel. If you implemented a custom backend that returned `null` from these methods, return `undefined` instead.

`RequestQueueBackend.isEmpty()` and `RequestQueueBackend.isFinished()` answer two different questions:

- `isEmpty()` is the weak check — `true` when the next `fetchNextRequest()` would return `undefined`, i.e. there is nothing left to fetch right now. Requests that are currently in progress (fetched but not yet handled or reclaimed) are **not** counted, because they are not fetchable. This is what drives the crawler's task scheduling.
- `isFinished()` is the strong check — `true` only when there are no pending requests **and** no requests currently in progress (including those locked by other clients sharing the queue). This is what determines whether crawling is actually done. An in-progress request keeps the queue *empty but not finished*, which is what stops a crawler from shutting down while a request is still being processed.

The loader and manager frontends do **not** draw that distinction — `IRequestLoader` and `IRequestManager` answer both questions with one [`checkReadiness()`](./request-loaders.md#isempty--isfinished-replaced-by-checkreadiness) call. The split lives at the backend boundary because that is the layer where the two questions really are two separate storage lookups; a frontend that split them too would either probe twice per scheduling decision or lose the distinction, whereas a backend that answers one at a time costs its caller nothing.

The separate `RequestQueueV1`/`RequestQueueV2` classes (and the `RequestProvider` base class) have been removed. They no longer differ in behavior — request coordination is now internal to the storage backend — so they are merged into a single `RequestQueue` class. Replace any `RequestQueueV1`, `RequestQueueV2`, or `RequestProvider` imports with `RequestQueue`.

The `requestLocking` crawler experiment has been removed, along with the `experiments` crawler option and the `CrawlerExperiments` type that contained it. Request locking has been the default since v3.10 and there is no longer an alternative implementation to opt out to, so the flag did nothing. Delete any `experiments: { requestLocking: ... }` from your crawler options:

```diff
 const crawler = new CheerioCrawler({
     async requestHandler({ $, request }) {
         // ...
     },
-    experiments: {
-        requestLocking: true,
-    },
 });
```

The `RequestQueue.requestLockSecs` property has been removed. Because request locking is now internal to the storage backend, the lock duration is no longer configured on the queue. When you run a crawler, it automatically tells the queue how long it expects to hold a request (based on `requestHandlerTimeoutMillis`), so a long-running request handler will not have its request handed out a second time — you usually don't need to configure anything.

If you use a `RequestQueue` outside of a crawler and your processing may exceed the 3-minute default lock, call `setExpectedRequestProcessingTimeSecs(secs)` on the queue to raise it:

```typescript
import { RequestQueue } from 'crawlee';

const queue = await RequestQueue.open();
await queue.setExpectedRequestProcessingTimeSecs(600);
```

The `RequestQueue.internalTimeoutMillis` property and the associated "stuck queue" self-recovery have been removed. In v3 the `RequestQueue` frontend kept its own copy of the queue head and in-progress set, which could drift out of sync with the backing storage (an eventual-consistency hazard on the Apify platform); `isFinished()` watched for inactivity exceeding `internalTimeoutMillis` and reset that frontend state to recover. In v4 the frontend no longer holds any such bookkeeping — the storage backend is the single source of truth — so there is nothing for a reset to fix, and stuck request locks now self-heal on expiry. Any consistency-recovery logic that is genuinely specific to the Apify platform's distributed storage belongs in the Apify SDK's client implementation instead, and is tracked in [apify/crawlee#3328](https://github.com/apify/crawlee/issues/3328).

**Apify-specific fields removed from storage metadata.** The metadata returned by `getMetadata()` (`DatasetInfo`, `KeyValueStoreInfo`, `RequestQueueInfo`) has been trimmed to what is meaningful for any storage backend. The following platform-specific fields were dropped: `actId`, `actRunId`, `userId`, and — on `RequestQueueInfo` — `expireAt` and `hadMultipleClients`. The per-storage `stats` field (and its `DatasetStats` / `KeyValueStoreStats` / `RequestQueueStats` types) was removed as well. If you consumed any of these, read them from the Apify API client directly; a custom `StorageBackend` should simply stop returning them.

**Removed types** from `@crawlee/types`: `DatasetClientUpdateOptions`, `KeyValueStoreClientUpdateOptions`, `KeyValueStoreRecordOptions`, `KeyValueStoreClientListData`, `KeyValueStoreClientGetRecordOptions`, `QueueHead`, `RequestQueueHeadItem`, `ListOptions`, `ListAndLockOptions`, `ListAndLockHeadResult`, `ProlongRequestLockOptions`, `ProlongRequestLockResult`, `DeleteRequestLockOptions`, `DatasetStats`, `KeyValueStoreStats`, `RequestQueueStats`. `KeyValueStoreClientListOptions` was renamed to `KeyValueStoreListKeysOptions`.

The high-level storage classes (`Dataset`, `KeyValueStore`, `RequestQueue`) are now thin wrappers over a single sub-backend, which they receive directly in the constructor options. The constructor takes `{ metadata, backend }`, where `backend` is the sub-backend and `metadata` is the resolved storage info (as returned by the backend's `getMetadata()`) that the storage derives its `id` and `name` from — instead of receiving separate `id` / `name` arguments (or a `StorageBackend` and calling its methods). In practice you never call these constructors yourself; use `Dataset.open()` / `KeyValueStore.open()` / `RequestQueue.open()`, which resolve the metadata and open the backend for you.

`RequestQueue` no longer accepts (or stores) `clientKey` / `timeoutSecs`. These are request-locking concerns that are now internal to the storage backend implementation (see [apify/crawlee#3328](https://github.com/apify/crawlee/issues/3328)); the `create*Backend` methods take a plain `StorageIdentifier` (`{ id?, name?, alias? }`).

### `RecordOptions` simplified

`timeoutSecs` and `doNotRetryTimeouts` were removed from `RecordOptions` (used by `KeyValueStore.setValue`). Only `contentType` remains.

### `maybeStringify` is removed

The `maybeStringify` helper exported from `@crawlee/core` has been removed. Value (de)serialization now lives entirely in the `KeyValueStore` frontend: writing serializes the value (and infers its content type), reading parses it back, and the storage backend is a plain byte transport. If you imported `maybeStringify` directly, use the `serializeValue` / `parseValue` functions exported from `@crawlee/core` instead.

### `KeyValueStoreIteratorOptions` simplified

`exclusiveStartKey` and `collection` were removed. Only `prefix` remains.

### `Dataset.listItems` replaced by `Dataset.getData` and `Dataset.values`

`Dataset.listItems()` is replaced by two methods:
- `Dataset.getData(options?)` — returns a single `PaginatedList<Data>` page.
- `Dataset.values(options?)` — dual iterable: `for await...of` iterates all items; `await` returns all items as `Data[]`.

`Dataset.entries()` works the same way as `values()` but yields `[index, Data]` tuples. `KeyValueStore.keys()`, `.values()`, `.entries()` follow the same dual-iterable pattern.

### Removed `list()` method

The `list()` method on collection clients (e.g. `client.datasets().list()`) has no replacement. If you were using it to enumerate all storages, you will need to use the Apify API client directly.

### Migration guide

If you implemented a custom `StorageBackend`, you need to:

1. Remove your `*CollectionClient` classes.
2. Replace the six getter methods (`dataset`, `datasets`, `keyValueStore`, `keyValueStores`, `requestQueue`, `requestQueues`) with three async factory methods (`createDatasetBackend`, `createKeyValueStoreBackend`, `createRequestQueueBackend`). Each factory should handle both opening an existing storage and creating a new one.
3. Apply the sub-backend renames listed above (`get` → `getMetadata`, `delete` → `drop`, etc.) and implement the new `purge()` method.

## Storage internals are no longer part of the public API

`DatasetOptions`, `KeyValueStoreOptions` and `RequestQueueOptions` are internal. They only described the arguments of the storage constructors, which were already internal — always open storages through the static `open()` methods.

## `Dataset` field visibility now matches its siblings

- `Dataset.backend` is private, matching `KeyValueStore.backend`. Use the `Dataset` methods (`pushData`, `getData`, `getInfo`, `drop`, ...) rather than reaching for the backend client.
- `Dataset.id` and `Dataset.name` are `readonly`, matching `KeyValueStore` and `RequestQueue`.
- `Dataset.log` has been removed. It was never read by Crawlee and `KeyValueStore` never had it; use your own logger, or `crawler.log` inside a request handler.

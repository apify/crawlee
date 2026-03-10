# `@crawlee/redis-storage`

A Redis-backed [`StorageClient`](https://crawlee.dev/api/types/interface/StorageClient) for [Crawlee](https://crawlee.dev) that enables **distributed crawling** with shared request queues across multiple processes and machines.

## Motivation

The default [`MemoryStorage`](https://crawlee.dev/api/memory-storage) is process-local, which means each worker maintains its own queue and you cannot easily coordinate work across machines. By pointing all workers at the same Redis instance (or cluster), they share a single queue with atomic enqueue/dequeue operations, distributed locking, and automatic lock recovery.

## Features

- **Atomic deduplication** – Lua scripts ensure `uniqueKey` deduplication is race-free.
- **Distributed locking** – `listAndLockHead` atomically moves requests to a locked state; expired locks are automatically recovered.
- **Forefront support** – requests enqueued with `{ forefront: true }` are served first.
- **Ordered processing** – pending requests are served in FIFO order by default.
- **Datasets & KV stores** – delegated to in-process `MemoryStorage` (with optional disk persistence) in the current version.

## Installation

```sh
npm install @crawlee/redis-storage ioredis
# or
yarn add @crawlee/redis-storage ioredis
```

## Quick start

```ts
import Redis from 'ioredis';
import { Configuration, CheerioCrawler } from 'crawlee';
import { RedisStorageClient } from '@crawlee/redis-storage';

// Connect to Redis
const redis = new Redis('redis://localhost:6379');

// Use RedisStorageClient as the global storage backend
Configuration.getGlobalConfig().set('storageClient', new RedisStorageClient(redis));

// All request queues are now backed by Redis
const crawler = new CheerioCrawler({
    async requestHandler({ request, $ }) {
        console.log(request.url, $('title').text());
    },
});

await crawler.run(['https://crawlee.dev']);
await redis.quit();
```

## Options

```ts
new RedisStorageClient(redis, {
    // Local directory for datasets / KV stores (MemoryStorage delegate)
    localDataDirectory: './storage',
    // Whether to persist datasets/KV stores to disk
    persistStorage: true,
});
```

## Redis data layout

All keys are namespaced under `rq:{queueId}:*`:

| Key | Type | Purpose |
|-----|------|---------|
| `rq:{id}:pending` | Sorted Set | Pending request IDs, scored by insertion order |
| `rq:{id}:locked` | Sorted Set | Locked request IDs (score retained from pending) |
| `rq:{id}:handled` | Set | IDs of handled requests |
| `rq:{id}:data:{reqId}` | Hash | Full serialised request data |
| `rq:{id}:uniqueKeys` | Hash | `uniqueKey` → `requestId` deduplication map |
| `rq:{id}:meta` | Hash | Queue metadata (counts, timestamps, name) |
| `rq:{id}:counter` | String | Monotonic counter for normal inserts |
| `rq:{id}:counter:front` | String | Monotonic counter for forefront inserts (decrements) |
| `rq:{id}:lockExpiry` | Hash | `requestId` → lock expiry (Unix seconds) |
| `rq:registry` | Hash | `name` → `id` global queue registry |
| `rq:registry:data:{id}` | Hash | Registry-level queue metadata |

## Running tests

Tests require a running Redis instance.

```sh
REDIS_URL=redis://localhost:6379 yarn vitest run packages/redis-storage/test
```

## License

Apache 2.0

import { randomUUID } from 'node:crypto';

import type { Redis } from 'ioredis';

import type * as storage from '@crawlee/types';

// ─── Key-name helpers ─────────────────────────────────────────────────────────
const K = {
    /** Sorted set: pending requests, scored by insertion order */
    pending: (id: string) => `rq:${id}:pending`,
    /** Sorted set: requests currently locked by a worker */
    locked: (id: string) => `rq:${id}:locked`,
    /** Set: IDs of handled requests */
    handled: (id: string) => `rq:${id}:handled`,
    /** Hash: full request data keyed by requestId */
    data: (id: string, reqId: string) => `rq:${id}:data:${reqId}`,
    /** Hash: uniqueKey → requestId (deduplication map) */
    uniqueKeys: (id: string) => `rq:${id}:uniqueKeys`,
    /** Hash: queue metadata (counts, timestamps, name, …) */
    meta: (id: string) => `rq:${id}:meta`,
    /** String counter: monotonically increasing score for normal inserts */
    counter: (id: string) => `rq:${id}:counter`,
    /** String counter: monotonically decreasing score for forefront inserts */
    counterFront: (id: string) => `rq:${id}:counter:front`,
    /** Hash: requestId → Unix-second expiry timestamp for locked requests */
    lockExpiry: (id: string) => `rq:${id}:lockExpiry`,
};

// ─── Lua scripts ──────────────────────────────────────────────────────────────

/**
 * Atomically add a request to the queue with uniqueKey deduplication.
 *
 * KEYS[1] = pending sorted set
 * KEYS[2] = handled set
 * KEYS[3] = uniqueKeys hash  (uniqueKey → requestId)
 * KEYS[4] = meta hash
 * KEYS[5] = regular counter  (INCR)
 * KEYS[6] = forefront counter (DECR)
 * KEYS[7] = request data hash
 *
 * ARGV[1] = uniqueKey
 * ARGV[2] = requestId
 * ARGV[3] = forefront flag ('1' or '0')
 * ARGV[4] = modifiedAt ISO timestamp
 * ARGV[5..N] = flat field/value pairs for the request data hash
 *
 * Returns [createdFlag (0|1), resolvedRequestId, wasHandledFlag (0|1)]
 */
const LUA_ADD_REQUEST = `
local pending       = KEYS[1]
local handled       = KEYS[2]
local uniqueKeys    = KEYS[3]
local meta          = KEYS[4]
local counter       = KEYS[5]
local frontCounter  = KEYS[6]
local data          = KEYS[7]

local uniqueKey  = ARGV[1]
local requestId  = ARGV[2]
local forefront  = ARGV[3]
local modifiedAt = ARGV[4]

-- Atomically claim this uniqueKey; HSETNX returns 1 only on first call
local created = redis.call('HSETNX', uniqueKeys, uniqueKey, requestId)
if created == 0 then
  local existingId = redis.call('HGET', uniqueKeys, uniqueKey)
  local wasHandled = redis.call('SISMEMBER', handled, existingId)
  return {0, existingId, wasHandled}
end

-- Compute ordered score
local score
if forefront == '1' then
  score = redis.call('DECR', frontCounter)
else
  score = redis.call('INCR', counter)
end

-- Store request fields (ARGV[5..N] are flat key/value pairs)
local fields = {}
for i = 5, #ARGV do
  table.insert(fields, ARGV[i])
end
redis.call('HSET', data, unpack(fields))

-- Enqueue and update metadata
redis.call('ZADD', pending, score, requestId)
redis.call('HINCRBY', meta, 'totalRequestCount', 1)
redis.call('HSET', meta, 'modifiedAt', modifiedAt)

return {1, requestId, 0}
`;

/**
 * Atomically move up to `limit` items from the pending sorted set to the
 * locked sorted set, recording a per-request lock expiry.
 *
 * KEYS[1] = pending sorted set
 * KEYS[2] = locked sorted set
 * KEYS[3] = lockExpiry hash
 * ARGV[1] = limit (number)
 * ARGV[2] = lockExpiresAt (Unix seconds)
 *
 * Returns array of requestIds that were locked.
 */
const LUA_LIST_AND_LOCK = `
local pending    = KEYS[1]
local locked     = KEYS[2]
local lockExpiry = KEYS[3]
local limit      = tonumber(ARGV[1])
local expiresAt  = ARGV[2]

local items = redis.call('ZRANGE', pending, 0, limit - 1, 'WITHSCORES')
if #items == 0 then
  return {}
end

local result = {}
for i = 1, #items, 2 do
  local reqId = items[i]
  local score = items[i + 1]
  redis.call('ZREM', pending, reqId)
  redis.call('ZADD', locked, score, reqId)
  redis.call('HSET', lockExpiry, reqId, expiresAt)
  table.insert(result, reqId)
end

return result
`;

/**
 * Move all expired locked requests back to the pending sorted set.
 *
 * KEYS[1] = locked sorted set
 * KEYS[2] = pending sorted set
 * KEYS[3] = lockExpiry hash
 * ARGV[1] = current time (Unix seconds)
 *
 * Returns the number of requests recovered.
 */
const LUA_RECOVER_EXPIRED_LOCKS = `
local locked     = KEYS[1]
local pending    = KEYS[2]
local lockExpiry = KEYS[3]
local now        = tonumber(ARGV[1])

local items     = redis.call('ZRANGE', locked, 0, -1, 'WITHSCORES')
local recovered = 0

for i = 1, #items, 2 do
  local reqId  = items[i]
  local score  = items[i + 1]
  local expiry = tonumber(redis.call('HGET', lockExpiry, reqId) or '0')
  if expiry > 0 and expiry <= now then
    redis.call('ZREM', locked, reqId)
    redis.call('ZADD', pending, score, reqId)
    redis.call('HDEL', lockExpiry, reqId)
    recovered = recovered + 1
  end
end

return recovered
`;

// ─── Serialisation helpers ────────────────────────────────────────────────────

function serializeRequest(req: Partial<storage.RequestSchema> & { id: string }): Record<string, string> {
    const fields: Record<string, string> = {
        id: req.id,
        url: req.url ?? '',
        uniqueKey: req.uniqueKey ?? req.url ?? '',
        method: req.method ?? 'GET',
        retryCount: String(req.retryCount ?? 0),
    };
    if (req.payload !== undefined) fields.payload = req.payload;
    if (req.noRetry !== undefined) fields.noRetry = String(req.noRetry);
    if (req.errorMessages?.length) fields.errorMessages = JSON.stringify(req.errorMessages);
    if (req.headers) fields.headers = JSON.stringify(req.headers);
    if (req.userData) fields.userData = JSON.stringify(req.userData);
    if (req.handledAt) fields.handledAt = req.handledAt;
    if (req.loadedUrl) fields.loadedUrl = req.loadedUrl;
    return fields;
}

function deserializeRequest(hash: Record<string, string>): storage.RequestOptions {
    return {
        id: hash.id,
        url: hash.url,
        uniqueKey: hash.uniqueKey,
        method: hash.method as storage.RequestSchema['method'],
        retryCount: parseInt(hash.retryCount ?? '0', 10),
        ...(hash.payload !== undefined ? { payload: hash.payload } : {}),
        ...(hash.noRetry !== undefined ? { noRetry: hash.noRetry === 'true' } : {}),
        ...(hash.errorMessages ? { errorMessages: JSON.parse(hash.errorMessages) } : {}),
        ...(hash.headers ? { headers: JSON.parse(hash.headers) } : {}),
        ...(hash.userData ? { userData: JSON.parse(hash.userData) } : {}),
        ...(hash.handledAt ? { handledAt: hash.handledAt } : {}),
        ...(hash.loadedUrl ? { loadedUrl: hash.loadedUrl } : {}),
    };
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * A {@linkcode storage.RequestQueueClient} backed by Redis.
 *
 * Data layout (all keys are prefixed with `rq:{queueId}:`):
 * - `pending`   — sorted set of pending request IDs (score = insertion order)
 * - `locked`    — sorted set of locked request IDs (score retained from pending)
 * - `handled`   — set of handled request IDs
 * - `data:{id}` — hash of serialised request fields
 * - `uniqueKeys`— hash mapping uniqueKey → requestId (used for deduplication)
 * - `meta`      — hash of queue metadata
 * - `counter`   — monotonic counter for normal insertions (INCR)
 * - `counter:front` — counter for forefront insertions (DECR)
 * - `lockExpiry`— hash mapping requestId → Unix-second lock expiry
 */
export class RedisRequestQueueClient implements storage.RequestQueueClient {
    private readonly redis: Redis;
    private readonly queueId: string;

    constructor(redis: Redis, queueId: string) {
        this.redis = redis;
        this.queueId = queueId;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async recoverExpiredLocks(): Promise<void> {
        const now = Math.floor(Date.now() / 1_000);
        await (this.redis as Redis).eval(
            LUA_RECOVER_EXPIRED_LOCKS,
            3,
            K.locked(this.queueId),
            K.pending(this.queueId),
            K.lockExpiry(this.queueId),
            String(now),
        );
    }

    private async fetchHeadItem(id: string): Promise<storage.RequestQueueHeadItem | undefined> {
        const data = await this.redis.hgetall(K.data(this.queueId, id));
        if (!data?.url) return undefined;
        return {
            id: data.id ?? id,
            retryCount: parseInt(data.retryCount ?? '0', 10),
            uniqueKey: data.uniqueKey ?? data.url,
            url: data.url,
            method: (data.method ?? 'GET') as storage.AllowedHttpMethods,
        };
    }

    // ── Interface implementation ──────────────────────────────────────────────

    async get(): Promise<storage.RequestQueueInfo | undefined> {
        const meta = await this.redis.hgetall(K.meta(this.queueId));
        if (!meta?.id) return undefined;

        const total = parseInt(meta.totalRequestCount ?? '0', 10);
        const handled = parseInt(meta.handledRequestCount ?? '0', 10);

        return {
            id: meta.id,
            name: meta.name || undefined,
            createdAt: new Date(meta.createdAt ?? Date.now()),
            modifiedAt: new Date(meta.modifiedAt ?? Date.now()),
            accessedAt: new Date(meta.accessedAt ?? Date.now()),
            totalRequestCount: total,
            handledRequestCount: handled,
            pendingRequestCount: total - handled,
            hadMultipleClients: meta.hadMultipleClients === 'true',
        };
    }

    async update(newFields: { name?: string }): Promise<Partial<storage.RequestQueueInfo> | undefined> {
        const updates: Record<string, string> = { modifiedAt: new Date().toISOString() };
        if (newFields.name !== undefined) updates.name = newFields.name;
        await this.redis.hset(K.meta(this.queueId), updates);
        return this.get();
    }

    async delete(): Promise<void> {
        const [pendingIds, lockedIds, handledIds] = await Promise.all([
            this.redis.zrange(K.pending(this.queueId), 0, -1),
            this.redis.zrange(K.locked(this.queueId), 0, -1),
            this.redis.smembers(K.handled(this.queueId)),
        ]);

        const allIds = [...new Set([...pendingIds, ...lockedIds, ...handledIds])];
        const pipeline = this.redis.pipeline();
        for (const id of allIds) pipeline.del(K.data(this.queueId, id));
        pipeline.del(K.pending(this.queueId));
        pipeline.del(K.locked(this.queueId));
        pipeline.del(K.handled(this.queueId));
        pipeline.del(K.uniqueKeys(this.queueId));
        pipeline.del(K.meta(this.queueId));
        pipeline.del(K.counter(this.queueId));
        pipeline.del(K.counterFront(this.queueId));
        pipeline.del(K.lockExpiry(this.queueId));
        await pipeline.exec();
    }

    async listHead(options?: storage.ListOptions): Promise<storage.QueueHead> {
        const limit = options?.limit ?? 100;
        await this.recoverExpiredLocks();

        const ids = await this.redis.zrange(K.pending(this.queueId), 0, limit - 1);
        const items: storage.RequestQueueHeadItem[] = [];
        for (const id of ids) {
            const item = await this.fetchHeadItem(id);
            if (item) items.push(item);
        }

        return { limit, queueModifiedAt: new Date(), hadMultipleClients: false, items };
    }

    async addRequest(
        request: storage.RequestSchema,
        options?: storage.RequestOptions,
    ): Promise<storage.QueueOperationInfo> {
        const forefront = options?.forefront ?? false;
        const requestId = request.id ?? randomUUID();
        const fields = serializeRequest({ ...request, id: requestId });
        const flatFields = Object.entries(fields).flat();

        const result = (await (this.redis as Redis).eval(
            LUA_ADD_REQUEST,
            7,
            K.pending(this.queueId),
            K.handled(this.queueId),
            K.uniqueKeys(this.queueId),
            K.meta(this.queueId),
            K.counter(this.queueId),
            K.counterFront(this.queueId),
            K.data(this.queueId, requestId),
            request.uniqueKey,
            requestId,
            forefront ? '1' : '0',
            new Date().toISOString(),
            ...flatFields,
        )) as [number, string, number];

        return {
            wasAlreadyPresent: result[0] === 0,
            wasAlreadyHandled: result[2] === 1,
            requestId: result[1],
        };
    }

    async batchAddRequests(
        requests: storage.RequestSchema[],
        options?: storage.RequestOptions,
    ): Promise<storage.BatchAddRequestsResult> {
        const processedRequests: storage.ProcessedRequest[] = [];
        const unprocessedRequests: storage.UnprocessedRequest[] = [];
        const forefront = options?.forefront ?? false;

        if (requests.length === 0) return { processedRequests, unprocessedRequests };

        // Single round-trip to check all unique keys at once
        const uniqueKeys = requests.map((r) => r.uniqueKey);
        const existing = await this.redis.hmget(K.uniqueKeys(this.queueId), ...uniqueKeys);

        const newRequests: Array<{ req: storage.RequestSchema }> = [];
        for (let i = 0; i < requests.length; i++) {
            const existingId = existing[i];
            if (existingId) {
                processedRequests.push({
                    uniqueKey: uniqueKeys[i],
                    requestId: existingId,
                    wasAlreadyPresent: true,
                    wasAlreadyHandled: false,
                });
            } else {
                newRequests.push({ req: requests[i] });
            }
        }

        if (newRequests.length === 0) return { processedRequests, unprocessedRequests };

        // Reserve a contiguous block of scores in one command
        let startScore: number;
        if (forefront) {
            startScore = await this.redis.decrby(K.counterFront(this.queueId), newRequests.length);
        } else {
            startScore = (await this.redis.incrby(K.counter(this.queueId), newRequests.length)) - newRequests.length;
        }

        const pipeline = this.redis.pipeline();
        for (let i = 0; i < newRequests.length; i++) {
            const { req } = newRequests[i];
            const requestId = req.id ?? randomUUID();
            const score = forefront ? startScore + i : startScore + i + 1;
            const fields = serializeRequest({ ...req, id: requestId });

            pipeline.hset(K.data(this.queueId, requestId), fields);
            pipeline.zadd(K.pending(this.queueId), score, requestId);
            pipeline.hset(K.uniqueKeys(this.queueId), req.uniqueKey, requestId);

            processedRequests.push({
                uniqueKey: req.uniqueKey,
                requestId,
                wasAlreadyPresent: false,
                wasAlreadyHandled: false,
            });
        }
        pipeline.hincrby(K.meta(this.queueId), 'totalRequestCount', newRequests.length);
        pipeline.hset(K.meta(this.queueId), 'modifiedAt', new Date().toISOString());
        await pipeline.exec();

        return { processedRequests, unprocessedRequests };
    }

    async getRequest(id: string): Promise<storage.RequestOptions | undefined> {
        const data = await this.redis.hgetall(K.data(this.queueId, id));
        if (!data?.url) return undefined;
        return deserializeRequest(data);
    }

    async updateRequest(
        request: storage.UpdateRequestSchema,
        options?: storage.RequestOptions,
    ): Promise<storage.QueueOperationInfo> {
        const forefront = options?.forefront ?? false;

        const exists = await this.redis.exists(K.data(this.queueId, request.id));
        if (!exists) {
            return { wasAlreadyPresent: false, wasAlreadyHandled: false, requestId: request.id };
        }

        const fields = serializeRequest(request);
        await this.redis.hset(K.data(this.queueId, request.id), fields);

        if (request.handledAt) {
            // Mark as handled and remove from all active sets
            const pipeline = this.redis.pipeline();
            pipeline.zrem(K.pending(this.queueId), request.id);
            pipeline.zrem(K.locked(this.queueId), request.id);
            pipeline.hdel(K.lockExpiry(this.queueId), request.id);
            pipeline.sadd(K.handled(this.queueId), request.id);
            pipeline.hincrby(K.meta(this.queueId), 'handledRequestCount', 1);
            pipeline.hset(K.meta(this.queueId), 'modifiedAt', new Date().toISOString());
            await pipeline.exec();
            return { wasAlreadyPresent: true, wasAlreadyHandled: false, requestId: request.id };
        }

        if (forefront) {
            const score = await this.redis.zscore(K.pending(this.queueId), request.id);
            if (score !== null) {
                const newScore = await this.redis.decr(K.counterFront(this.queueId));
                await this.redis.zadd(K.pending(this.queueId), newScore, request.id);
            }
        }

        return { wasAlreadyPresent: true, wasAlreadyHandled: false, requestId: request.id };
    }

    async deleteRequest(id: string): Promise<unknown> {
        const data = await this.redis.hgetall(K.data(this.queueId, id));
        const pipeline = this.redis.pipeline();
        if (data?.uniqueKey) pipeline.hdel(K.uniqueKeys(this.queueId), data.uniqueKey);
        pipeline.zrem(K.pending(this.queueId), id);
        pipeline.zrem(K.locked(this.queueId), id);
        pipeline.hdel(K.lockExpiry(this.queueId), id);
        pipeline.srem(K.handled(this.queueId), id);
        pipeline.del(K.data(this.queueId, id));
        await pipeline.exec();
        return undefined;
    }

    async listAndLockHead(options: storage.ListAndLockOptions): Promise<storage.ListAndLockHeadResult> {
        const { lockSecs } = options;
        const limit = options.limit ?? 25;
        const lockExpiresAt = Math.floor(Date.now() / 1_000) + lockSecs;

        await this.recoverExpiredLocks();

        const lockedIds = (await (this.redis as Redis).eval(
            LUA_LIST_AND_LOCK,
            3,
            K.pending(this.queueId),
            K.locked(this.queueId),
            K.lockExpiry(this.queueId),
            String(limit),
            String(lockExpiresAt),
        )) as string[];

        const items: storage.RequestQueueHeadItem[] = [];
        for (const id of lockedIds ?? []) {
            const item = await this.fetchHeadItem(id);
            if (item) items.push(item);
        }

        const lockedCount = await this.redis.zcard(K.locked(this.queueId));

        return {
            limit,
            lockSecs,
            queueModifiedAt: new Date(),
            items,
            queueHasLockedRequests: lockedCount > 0,
        };
    }

    async prolongRequestLock(
        id: string,
        options: storage.ProlongRequestLockOptions,
    ): Promise<storage.ProlongRequestLockResult> {
        const lockExpiresAt = Math.floor(Date.now() / 1_000) + options.lockSecs;
        await this.redis.hset(K.lockExpiry(this.queueId), id, String(lockExpiresAt));

        if (options.forefront) {
            const score = await this.redis.decr(K.counterFront(this.queueId));
            await this.redis.zadd(K.locked(this.queueId), score, id);
        }

        return { lockExpiresAt: new Date(lockExpiresAt * 1_000) };
    }

    async deleteRequestLock(id: string, options?: storage.DeleteRequestLockOptions): Promise<void> {
        const rawScore = await this.redis.zscore(K.locked(this.queueId), id);
        if (rawScore === null) return;

        const pipeline = this.redis.pipeline();
        pipeline.zrem(K.locked(this.queueId), id);
        pipeline.hdel(K.lockExpiry(this.queueId), id);

        if (options?.forefront) {
            const newScore = await this.redis.decr(K.counterFront(this.queueId));
            pipeline.zadd(K.pending(this.queueId), newScore, id);
        } else {
            pipeline.zadd(K.pending(this.queueId), parseFloat(rawScore), id);
        }

        await pipeline.exec();
    }
}

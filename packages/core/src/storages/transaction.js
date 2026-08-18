import { AsyncLocalStorage } from 'node:async_hooks';
import { addTimeoutToPromise, storage as timeoutStorage, tryCancel } from '@apify/timeout';
import { serviceLocator } from '../service_locator.js';
const DEFAULT_STORAGE_WRITE_POLICY = { requestQueue: 'writeThrough' };
const DEFAULT_COMMIT_TIMEOUT_MILLIS = 300_000;
const transactionStorage = new AsyncLocalStorage();
const COMMIT_ORDER = ['keyValueStore', 'requestQueue', 'dataset'];
/**
 * A storage transaction scoped to a request's lifecycle. Writes made through the storage frontends
 * ({@apilink Dataset}, {@apilink KeyValueStore}, {@apilink RequestQueue}) while the transaction is active
 * are recorded rather than applied; on {@apilink StorageTransaction.commit|`commit()`} they are replayed
 * into real storage, on {@apilink StorageTransaction.rollback|`rollback()`} they are dropped. Reads consult
 * the recorded writes first, so a handler sees its own writes.
 *
 * Create one with {@apilink createStorageTransaction} (explicit commit/rollback) or
 * {@apilink withStorageTransaction} (scoped sugar). Crawlers open one automatically around every request
 * handler unless `transactionalStorage: false` is set.
 */
export class StorageTransaction {
    /** The ordered, append-only journal — the source of truth for commit, introspection and reads. */
    journal = [];
    /** Per-storage-type write policy. */
    policy;
    #commitTimeoutMillis;
    #state = 'open';
    #disposed = false;
    /** @internal */
    constructor(options = {}) {
        this.policy = { ...DEFAULT_STORAGE_WRITE_POLICY, ...options.policy };
        this.#commitTimeoutMillis = options.commitTimeoutMillis ?? DEFAULT_COMMIT_TIMEOUT_MILLIS;
    }
    get state() {
        return this.#state;
    }
    /**
     * `true` only while `state === 'open'`. This is the single predicate every storage operation
     * consults — operations performed after the transaction is closed pass through to the real backend.
     */
    get isActive() {
        return this.#state === 'open';
    }
    /** Runs `callback` with this transaction installed in the async context. */
    async run(callback) {
        return transactionStorage.run(this, async () => callback());
    }
    /**
     * Records a write operation in the journal.
     * @internal
     */
    recordJournalEntry(entry) {
        if (!this.isActive) {
            throw new Error(`Cannot record a journal entry on a transaction in the '${this.#state}' state`);
        }
        this.journal.push(entry);
    }
    /**
     * Replays the journaled writes into real storage. A no-op unless the transaction is `open`.
     *
     * The transaction transitions to `committing` *before* anything is flushed, so a commit that throws
     * partway lands in `failed` (never back in `open`) and subsequent storage operations pass through
     * rather than recording into a dead transaction. Delivery is at-least-once — a commit that fails
     * partway may have applied some of the writes already.
     */
    async commit() {
        if (this.#state !== 'open') {
            return;
        }
        this.#state = 'committing';
        try {
            // The replay re-drives the frontend write path, which checks for cancellation (`tryCancel`)
            // on every operation - and `@apify/timeout` shares one `AbortController` across nested
            // frames, so a request-handler timeout that already fired would abort the commit of a
            // handler that succeeded. Hence a fresh timeout context, which also provides the time bound.
            await timeoutStorage.exit(async () => addTimeoutToPromise(async () => this.flush(), this.#commitTimeoutMillis, `Committing the storage transaction timed out after ${this.#commitTimeoutMillis / 1000} seconds.`));
            this.#state = 'committed';
        }
        catch (error) {
            this.#state = 'failed';
            throw error;
        }
    }
    async flush() {
        // Each participating frontend replays all of its buffered entries in one call. Frontends are
        // ordered by storage type: key-value stores and request queues first (idempotent under retry),
        // datasets last (not idempotent), minimizing the blast radius of a partial commit failure.
        const groups = new Map();
        for (const entry of this.journal) {
            if (entry.type === 'requestQueue' && entry.writeThrough)
                continue;
            const group = groups.get(entry.participant);
            if (group)
                group.push(entry);
            else
                groups.set(entry.participant, [entry]);
        }
        // A participant only records entries of its own storage type, so the first entry determines
        // the group's place in the commit order.
        const orderedGroups = [...groups.values()].sort((a, b) => COMMIT_ORDER.indexOf(a[0].type) - COMMIT_ORDER.indexOf(b[0].type));
        for (const entries of orderedGroups) {
            await entries[0].participant.commitJournalEntries(entries);
        }
    }
    /**
     * Discards the journaled writes. A no-op unless the transaction is `open` — in particular, calling it
     * after a successful `commit()` (which the crawler's error handling can legitimately do) does nothing
     * and never throws.
     */
    rollback() {
        if (this.#state !== 'open') {
            return;
        }
        this.#state = 'rolledBack';
    }
    /**
     * Releases the journal and the write-time snapshots it holds. Must be called for *every* terminal
     * state, `failed` included. Idempotent, never throws, and does not change `state`. Any
     * {@apilink StorageTransactionView} of this transaction is only valid until this is called.
     */
    dispose() {
        if (this.#disposed) {
            return;
        }
        if (this.#state === 'open') {
            // Disposing an open transaction is an internal invariant violation - roll back first.
            try {
                serviceLocator
                    .getLogger()
                    .warning('Internal error: a storage transaction was disposed while still open; rolling it back.');
            }
            catch {
                // Never throw from dispose.
            }
            this.rollback();
        }
        this.#disposed = true;
        this.journal.length = 0;
    }
    get datasetItems() {
        return this.journal.flatMap((entry) => entry.type === 'dataset' ? entry.items.map((item) => ({ item, datasetId: entry.storageId })) : []);
    }
    get enqueuedUrls() {
        return this.journal.flatMap((entry) => entry.type === 'requestQueue' ? entry.requests.map(({ url, label }) => ({ url, label })) : []);
    }
    get keyValueStoreChanges() {
        const result = {};
        for (const entry of this.journal) {
            if (entry.type !== 'keyValueStore')
                continue;
            result[entry.storageId] ??= {};
            result[entry.storageId][entry.key] = { changedValue: entry.value, options: entry.options };
        }
        return result;
    }
}
/**
 * Opens a {@apilink StorageTransaction} without running anything yet. The caller owns the outcome:
 * `run()`, then `commit()` or `rollback()`, and always `dispose()` when done. For the common
 * open-run-commit flow, prefer {@apilink withStorageTransaction}.
 */
export function createStorageTransaction(options = {}) {
    return new StorageTransaction(options);
}
/**
 * Runs `callback` inside a new {@apilink StorageTransaction}: storage writes made in the callback are
 * committed when it returns and rolled back when it throws. If a transaction is already active in the
 * current async context, it is reused and its outcome is left to its owner (and `options` are ignored)
 * — there are no nested transaction semantics.
 */
export async function withStorageTransaction(callback, options = {}) {
    const existing = transactionStorage.getStore();
    if (existing?.isActive) {
        return callback(existing);
    }
    const transaction = createStorageTransaction(options);
    try {
        const result = await transaction.run(async () => callback(transaction));
        await transaction.commit();
        return result;
    }
    catch (error) {
        transaction.rollback();
        throw error;
    }
    finally {
        transaction.dispose();
    }
}
/**
 * Runs `callback` outside of any storage transaction — the per-call-site escape hatch. Storage operations
 * made inside it hit the real backend directly, are not rolled back, and operations that a transaction
 * rejects (`drop`, stream-valued `setValue`, request queue internals, ...) are permitted.
 */
export async function withDirectStorageAccess(callback) {
    return transactionStorage.exit(async () => callback());
}
/**
 * The per-operation hook consulted by every storage frontend method: performs the cancellation check
 * that aborts storage operations when the request handler times out, and returns the active storage
 * transaction. Returns `undefined` when there is no transaction in the async context *or* when it is no
 * longer open — operations on a closed transaction deliberately pass through to the real backend.
 * @internal
 */
export function activeStorageTransaction() {
    tryCancel();
    const transaction = transactionStorage.getStore();
    return transaction?.isActive ? transaction : undefined;
}
/**
 * Returns the transaction installed in the current async context, regardless of its state. Used by the
 * crawler to drive the outcome of the transaction it opened.
 * @internal
 */
export function currentStorageTransaction() {
    return transactionStorage.getStore();
}
/**
 * Captures a value at write time, so that later mutations of the caller's object affect neither the
 * read-your-own-writes reads nor the commit replay. `structuredClone` for fidelity (`Date`, `Map`, `Set`,
 * typed arrays, `undefined`); values it cannot handle fall back to the JSON round-trip the storage
 * backends perform anyway.
 * @internal
 */
export function snapshotValue(value) {
    try {
        return structuredClone(value);
    }
    catch {
        return JSON.parse(JSON.stringify(value));
    }
}
/**
 * The guard for operations that cannot be performed inside a storage transaction: throws when one is
 * active, and performs the per-operation cancellation check either way.
 * @internal
 */
export function rejectOperationInTransaction(operation, reason = 'it cannot be rolled back.') {
    if (activeStorageTransaction() === undefined) {
        return;
    }
    throw operationRejectedInTransaction(operation, reason);
}
/**
 * Builds the "operation not allowed in a transaction" error, for a call site that has already
 * established a transaction is active and so wants to `throw` unconditionally.
 * @internal
 */
export function operationRejectedInTransaction(operation, reason = 'it cannot be rolled back.') {
    return new Error(`${operation} cannot be used inside a storage transaction: ${reason} ` +
        'If you really need it, wrap the call in withDirectStorageAccess(() => ...) - operations ' +
        'performed there are applied immediately and are not rolled back.');
}

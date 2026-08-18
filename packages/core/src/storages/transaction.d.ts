import type { Awaitable, Dictionary } from '@crawlee/types';
import type { RecordOptions } from './key_value_store.js';
/**
 * Governs whether writes of a given storage type performed inside a {@apilink StorageTransaction} are
 * applied immediately (`writeThrough`) or recorded and replayed on commit (`deferred`).
 */
export type StorageWriteMode = 'deferred' | 'writeThrough';
/**
 * Per-storage-type write policy of a {@apilink StorageTransaction}. Datasets and key-value stores are
 * always `deferred` and not configurable — deferring is the only safe mode for non-idempotent writes,
 * and {@apilink withDirectStorageAccess} covers one-off immediate writes.
 */
export interface StorageWritePolicy {
    /**
     * Write mode for request queue additions. Note that this is a *write policy* for the queue, not the
     * queue instance itself (which is the top-level `requestQueue` crawler option).
     *
     * - `writeThrough` (default): requests are added immediately and are **not** rolled back with the
     *   transaction. This is safe (additions are deduplicated by `uniqueKey`, so a retry is idempotent)
     *   and keeps new requests visible to the crawler while the handler still runs.
     * - `deferred`: requests are only added when the transaction commits — strict all-or-nothing
     *   semantics, at the cost of the crawler not seeing them until the handler finishes.
     */
    requestQueue: StorageWriteMode;
}
export type StorageTransactionState = 'open' | 'committing' | 'committed' | 'failed' | 'rolledBack';
/**
 * A storage frontend that can record operations in a transaction journal.
 * @internal
 */
export interface TransactionParticipant {
    /**
     * Replay the given buffered journal entries (all recorded by this participant) into the real storage
     * backend. Called during commit, with the transaction already in the `committing` state, so the
     * replayed operations pass through.
     */
    commitJournalEntries(entries: JournalEntry[]): Promise<void>;
}
/**
 * A single dataset write (`pushData`) recorded in a transaction journal.
 */
export interface DatasetJournalEntry {
    type: 'dataset';
    /** @internal **/
    participant: TransactionParticipant;
    storageId: string;
    /** The pushed items, captured by `structuredClone` at write time. */
    items: Dictionary[];
    recordedAt: Date;
}
/**
 * A single key-value store write (`setValue`) recorded in a transaction journal.
 */
export interface KeyValueStoreJournalEntry {
    type: 'keyValueStore';
    /** @internal **/
    participant: TransactionParticipant;
    storageId: string;
    key: string;
    /** The original, pre-serialization value captured by `structuredClone`; `null` denotes a deletion. */
    value: unknown;
    options?: RecordOptions;
}
/**
 * A request recorded in a transaction journal.
 */
export interface JournaledRequest {
    url: string;
    uniqueKey: string;
    label?: string;
    /**
     * A full JSON snapshot of the request for the commit replay. Only present for buffered additions —
     * deduplicated and write-through ones are journaled for introspection only.
     */
    snapshot?: Dictionary;
}
/**
 * A batch of request queue additions recorded in a transaction journal.
 */
export interface RequestQueueJournalEntry {
    type: 'requestQueue';
    /** @internal **/
    participant: TransactionParticipant;
    requests: JournaledRequest[];
    forefront: boolean;
    /** Write-through entries were applied immediately; they are never replayed. */
    writeThrough: boolean;
}
export type JournalEntry = DatasetJournalEntry | KeyValueStoreJournalEntry | RequestQueueJournalEntry;
/**
 * A read-only view of a {@apilink StorageTransaction}: only the journal-backed introspection accessors,
 * without the lifecycle methods. The accessors are synchronous and expose the original pre-serialization
 * values. They cover every write recorded while the transaction was open, under either write policy —
 * with the one exception noted on {@apilink StorageTransactionView.enqueuedUrls|`enqueuedUrls`}. A view
 * is valid until the transaction is disposed.
 */
export interface StorageTransactionView {
    readonly state: StorageTransactionState;
    /** Items pushed to datasets during the transaction, in push order. */
    readonly datasetItems: {
        item: Dictionary;
        datasetId: string;
    }[];
    /**
     * URLs enqueued to request queues during the transaction, under either write policy. Recorded as
     * requested, so duplicate, already-present and backend-rejected URLs are included.
     *
     * One gap: unless a caller of `addRequestsBatched()` waits for every chunk
     * (`waitForAllRequestsToBeAdded` or `maxNewRequests`, both of which {@apilink enqueueLinks} sets when
     * a crawl limit applies), the chunks after the first are added by a background writer that outlives
     * the transaction and is not recorded here.
     */
    readonly enqueuedUrls: {
        url: string;
        label?: string;
    }[];
    /** Key-value store changes made during the transaction, keyed by store id, last write per key. */
    readonly keyValueStoreChanges: Record<string, Record<string, {
        changedValue: unknown;
        options?: RecordOptions;
    }>>;
}
export interface StorageTransactionOptions {
    /** Overrides of the per-storage-type write policy. See {@apilink StorageWritePolicy}. */
    policy?: Partial<StorageWritePolicy>;
    /**
     * How long a commit may take before it fails, in milliseconds. There is no automatic retry — the
     * replay of dataset items is not idempotent.
     * @default 300000
     */
    commitTimeoutMillis?: number;
}
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
export declare class StorageTransaction implements StorageTransactionView {
    #private;
    /** The ordered, append-only journal — the source of truth for commit, introspection and reads. */
    readonly journal: JournalEntry[];
    /** Per-storage-type write policy. */
    readonly policy: StorageWritePolicy;
    /** @internal */
    constructor(options?: StorageTransactionOptions);
    get state(): StorageTransactionState;
    /**
     * `true` only while `state === 'open'`. This is the single predicate every storage operation
     * consults — operations performed after the transaction is closed pass through to the real backend.
     */
    get isActive(): boolean;
    /** Runs `callback` with this transaction installed in the async context. */
    run<T>(callback: () => Awaitable<T>): Promise<T>;
    /**
     * Records a write operation in the journal.
     * @internal
     */
    recordJournalEntry(entry: JournalEntry): void;
    /**
     * Replays the journaled writes into real storage. A no-op unless the transaction is `open`.
     *
     * The transaction transitions to `committing` *before* anything is flushed, so a commit that throws
     * partway lands in `failed` (never back in `open`) and subsequent storage operations pass through
     * rather than recording into a dead transaction. Delivery is at-least-once — a commit that fails
     * partway may have applied some of the writes already.
     */
    commit(): Promise<void>;
    private flush;
    /**
     * Discards the journaled writes. A no-op unless the transaction is `open` — in particular, calling it
     * after a successful `commit()` (which the crawler's error handling can legitimately do) does nothing
     * and never throws.
     */
    rollback(): void;
    /**
     * Releases the journal and the write-time snapshots it holds. Must be called for *every* terminal
     * state, `failed` included. Idempotent, never throws, and does not change `state`. Any
     * {@apilink StorageTransactionView} of this transaction is only valid until this is called.
     */
    dispose(): void;
    get datasetItems(): {
        item: Dictionary;
        datasetId: string;
    }[];
    get enqueuedUrls(): {
        url: string;
        label?: string;
    }[];
    get keyValueStoreChanges(): Record<string, Record<string, {
        changedValue: unknown;
        options?: RecordOptions;
    }>>;
}
/**
 * Opens a {@apilink StorageTransaction} without running anything yet. The caller owns the outcome:
 * `run()`, then `commit()` or `rollback()`, and always `dispose()` when done. For the common
 * open-run-commit flow, prefer {@apilink withStorageTransaction}.
 */
export declare function createStorageTransaction(options?: StorageTransactionOptions): StorageTransaction;
/**
 * Runs `callback` inside a new {@apilink StorageTransaction}: storage writes made in the callback are
 * committed when it returns and rolled back when it throws. If a transaction is already active in the
 * current async context, it is reused and its outcome is left to its owner (and `options` are ignored)
 * — there are no nested transaction semantics.
 */
export declare function withStorageTransaction<T>(callback: (transaction: StorageTransaction) => Awaitable<T>, options?: StorageTransactionOptions): Promise<T>;
/**
 * Runs `callback` outside of any storage transaction — the per-call-site escape hatch. Storage operations
 * made inside it hit the real backend directly, are not rolled back, and operations that a transaction
 * rejects (`drop`, stream-valued `setValue`, request queue internals, ...) are permitted.
 */
export declare function withDirectStorageAccess<T>(callback: () => Awaitable<T>): Promise<T>;
/**
 * The per-operation hook consulted by every storage frontend method: performs the cancellation check
 * that aborts storage operations when the request handler times out, and returns the active storage
 * transaction. Returns `undefined` when there is no transaction in the async context *or* when it is no
 * longer open — operations on a closed transaction deliberately pass through to the real backend.
 * @internal
 */
export declare function activeStorageTransaction(): StorageTransaction | undefined;
/**
 * Returns the transaction installed in the current async context, regardless of its state. Used by the
 * crawler to drive the outcome of the transaction it opened.
 * @internal
 */
export declare function currentStorageTransaction(): StorageTransaction | undefined;
/**
 * Captures a value at write time, so that later mutations of the caller's object affect neither the
 * read-your-own-writes reads nor the commit replay. `structuredClone` for fidelity (`Date`, `Map`, `Set`,
 * typed arrays, `undefined`); values it cannot handle fall back to the JSON round-trip the storage
 * backends perform anyway.
 * @internal
 */
export declare function snapshotValue<T>(value: T): T;
/**
 * The guard for operations that cannot be performed inside a storage transaction: throws when one is
 * active, and performs the per-operation cancellation check either way.
 * @internal
 */
export declare function rejectOperationInTransaction(operation: string, reason?: string): void;
/**
 * Builds the "operation not allowed in a transaction" error, for a call site that has already
 * established a transaction is active and so wants to `throw` unconditionally.
 * @internal
 */
export declare function operationRejectedInTransaction(operation: string, reason?: string): Error;

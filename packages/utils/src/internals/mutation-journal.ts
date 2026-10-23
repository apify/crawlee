interface JournalEntry {
    target: object;
    /** Location of `target` under the root it was reached from, for replaying onto another root. */
    path: PropertyKey[];
    key: PropertyKey;
    had: boolean;
    prev: unknown;
    next: unknown;
    deleted: boolean;
}

/**
 * Only plain objects and arrays are wrapped when reached through a tracked object. Built-ins such as `Map`
 * or `Set` reject a proxy receiver in their methods, and the tracked objects are JSON-shaped by contract
 * anyway - such values are handed out as they are, and their mutations are not recorded.
 */
const isTrackable = (value: unknown): value is object =>
    Array.isArray(value) ||
    (typeof value === 'object' &&
        value !== null &&
        (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));

/**
 * Records property writes made through the proxies it hands out, applying them to the real objects as
 * they happen, so that a losing attempt's writes can be undone afterwards - on the objects themselves
 * ({@apilink MutationJournal.revert|`revert()`}), or on a copy of them
 * ({@apilink MutationJournal.undoOnto|`undoOnto()`}) to reconstruct how they looked before the attempt.
 *
 * An undo on the live object only touches a property that still holds the value the attempt wrote - a
 * value written by someone else in the meantime is left alone and reported via `onConflict`. Writes that
 * bypass the proxy are invisible until they trip that guard.
 */
export class MutationJournal {
    readonly #entries: JournalEntry[] = [];
    readonly #proxies = new WeakMap<object, object>();
    readonly #paths = new WeakMap<object, PropertyKey[]>();
    #closed = false;

    track<T extends object>(target: T, path: PropertyKey[] = []): T {
        const cached = this.#proxies.get(target);
        if (cached) return cached as T;

        this.#paths.set(target, path);
        const entry = (key: PropertyKey, fields: Omit<JournalEntry, 'target' | 'path' | 'key'>) =>
            this.#entries.push({ target, path, key, ...fields });

        // Accessors run with `this` as the real object, not the proxy: class accessors may touch `#private`
        // members, which throw on a proxy receiver. An accessor write is therefore journaled as its own
        // entry and undone through the same setter, rather than through whatever it writes underneath.
        const proxy = new Proxy(target, {
            get: (object, key) => {
                const value = Reflect.get(object, key);
                return isTrackable(value) ? this.track(value, [...path, key]) : value;
            },
            set: (object, key, next) => {
                const had = Reflect.has(object, key);
                const prev = Reflect.get(object, key);
                this.#recordArrayTruncation(object, key, next);
                if (!Reflect.set(object, key, next)) return false;
                // An array's `length` is implied by its elements and never undone on its own.
                if (!this.#closed && !(Array.isArray(object) && key === 'length')) {
                    entry(key, { had, prev, next, deleted: false });
                }
                return true;
            },
            deleteProperty: (object, key) => {
                const had = Reflect.has(object, key);
                const prev = Reflect.get(object, key);
                if (!Reflect.deleteProperty(object, key)) return false;
                if (!this.#closed && had) entry(key, { had, prev, next: undefined, deleted: true });
                return true;
            },
        });

        this.#proxies.set(target, proxy);
        return proxy;
    }

    /**
     * Shrinking an array's `length` drops elements without a trap firing for them. They are recorded as
     * deletions, from the highest index down, so the reverse replay reinserts them from the lowest up.
     */
    #recordArrayTruncation(object: object, key: PropertyKey, next: unknown): void {
        if (this.#closed || !Array.isArray(object) || key !== 'length') return;
        const path = this.#paths.get(object)!;

        for (let i = object.length - 1; i >= (next as number); i--) {
            if (i in object) {
                this.#entries.push({
                    target: object,
                    path,
                    key: String(i),
                    had: true,
                    prev: object[i],
                    next: undefined,
                    deleted: true,
                });
            }
        }
    }

    /**
     * Restores one entry on `target`. Array elements are handled positionally - an added element is removed
     * and a removed one reinserted, shifting the rest - so the result stays something a sequence of `push`
     * and `splice` calls could have produced, even next to elements another writer added meanwhile.
     */
    static #undo(target: object, { key, had, deleted }: JournalEntry, value: unknown): void {
        if (Array.isArray(target) && typeof key === 'string' && Number.isInteger(Number(key))) {
            if (deleted) {
                target.splice(Number(key), 0, value);
            } else if (had) {
                target[Number(key)] = value;
            } else {
                target.splice(Number(key), 1);
            }
            return;
        }

        if (had) {
            Reflect.set(target, key, value);
        } else {
            Reflect.deleteProperty(target, key);
        }
    }

    /** Stops recording. Proxies keep writing through. */
    close(): void {
        this.#closed = true;
    }

    /** Undoes the recorded writes, newest first, and stops recording. */
    revert({ onConflict }: { onConflict?: (key: PropertyKey) => void } = {}): void {
        this.close();

        for (let i = this.#entries.length - 1; i >= 0; i--) {
            const entry = this.#entries[i];
            const { target, key, next, deleted } = entry;
            const untouched = deleted ? !Reflect.has(target, key) : Reflect.get(target, key) === next;

            if (!untouched) {
                onConflict?.(key);
                continue;
            }

            MutationJournal.#undo(target, entry, entry.prev);
        }

        this.#entries.length = 0;
    }

    /**
     * Applies the inverse of the recorded writes onto `root`, a JSON copy of the tracked object, and returns
     * it. The journal is left as it is. Restored values are JSON-cloned too, so the copy shares nothing with
     * the original and non-JSON values drop out the same way on both.
     *
     * Entries are located by the path under which their object was *first* reached, so an object reachable
     * through two paths is undone under the first one only.
     */
    undoOnto<T extends object>(root: T): T {
        for (let i = this.#entries.length - 1; i >= 0; i--) {
            const entry = this.#entries[i];
            const target = entry.path.reduce<unknown>(
                (object, step) => (object as Record<PropertyKey, unknown>)?.[step],
                root,
            );
            if (typeof target !== 'object' || target === null) continue;

            MutationJournal.#undo(
                target,
                entry,
                isTrackable(entry.prev) ? JSON.parse(JSON.stringify(entry.prev)) : entry.prev,
            );
        }

        return root;
    }
}

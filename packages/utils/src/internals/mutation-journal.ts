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
                this.#recordArrayLengthChange(object, key, had, next);
                if (!Reflect.set(object, key, next)) return false;
                if (!this.#closed) entry(key, { had, prev, next, deleted: false });
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
     * Engines update an array's `length` as a side effect of index writes without a trap firing, and
     * shrinking `length` drops elements. Both are recorded explicitly, *before* the write they belong to, so
     * the reverse replay sees the restored `length` before it touches the elements.
     */
    #recordArrayLengthChange(object: object, key: PropertyKey, had: boolean, next: unknown): void {
        if (this.#closed || !Array.isArray(object)) return;
        const path = this.#paths.get(object)!;

        if (key === 'length') {
            for (let i = next as number; i < object.length; i++) {
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
            return;
        }

        if (!had && typeof key === 'string' && Number.isInteger(Number(key)) && Number(key) >= object.length) {
            this.#entries.push({
                target: object,
                path,
                key: 'length',
                had: true,
                prev: object.length,
                next: Number(key) + 1,
                deleted: false,
            });
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
            const { target, key, had, prev, next, deleted } = this.#entries[i];
            const untouched = deleted ? !Reflect.has(target, key) : Reflect.get(target, key) === next;

            if (!untouched) {
                onConflict?.(key);
                continue;
            }

            if (had) {
                Reflect.set(target, key, prev);
            } else {
                Reflect.deleteProperty(target, key);
            }
        }

        this.#entries.length = 0;
    }

    /**
     * Applies the inverse of the recorded writes onto `root`, a copy of the tracked object, and returns it.
     * The journal is left as it is. Restored values are cloned so the copy shares nothing with the original.
     */
    undoOnto<T extends object>(root: T): T {
        for (let i = this.#entries.length - 1; i >= 0; i--) {
            const { path, key, had, prev } = this.#entries[i];
            const target = path.reduce<unknown>(
                (object, step) => (object as Record<PropertyKey, unknown>)?.[step],
                root,
            );
            if (typeof target !== 'object' || target === null) continue;

            if (had) {
                Reflect.set(target, key, isTrackable(prev) ? structuredClone(prev) : prev);
            } else {
                Reflect.deleteProperty(target, key);
            }
        }

        return root;
    }
}

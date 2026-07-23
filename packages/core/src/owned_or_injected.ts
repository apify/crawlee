/**
 * Captures the "inject-or-default" ownership pattern for a crawler's stateful collaborators (session pool, browser
 * pool, the crawler-opened request queue, ...). A collaborator is either **injected** by the user (borrowed — the
 * crawler never drives its lifecycle) or **built by the crawler** as a default (owned — the crawler sequences its
 * lifecycle). Owned-only lifecycle hooks are gated through a single {@apilink OwnedOrInjected.ifOwned|`ifOwned()`}.
 *
 * This is the deliberate complement to the {@apilink ServiceLocator}: ambient infrastructure (config/events/storage/
 * logger) stays in the locator, while crawler-scoped stateful collaborators the crawler sequences go through this.
 */
export class OwnedOrInjected<Injected, Owned extends Injected = Injected> {
    private _value: Injected | undefined;
    private readonly _owned: boolean;
    private _present: boolean;

    private constructor(value: Injected | undefined, owned: boolean, present: boolean) {
        this._value = value;
        this._owned = owned;
        this._present = present;
    }

    /**
     * Resolves a collaborator from an optionally-injected instance. `Injected` is the public/borrowed type exposed via
     * {@apilink OwnedOrInjected.value|`value`}; `Owned` is the concrete type the crawler builds (a subtype with extra
     * lifecycle methods), which {@apilink OwnedOrInjected.set|`set()`} and {@apilink OwnedOrInjected.ifOwned|`ifOwned()`}
     * deal in — so owned-only lifecycle hooks are statically typed with no casts.
     *
     * - `injected` provided → borrowed (present, not owned).
     * - `injected` omitted → owned; `buildDefault` fills the slot eagerly if given, otherwise it stays empty until a
     *   later {@apilink OwnedOrInjected.set|`set()`} (the lazy case, e.g. a request queue opened on first use).
     */
    static resolve<Injected, Owned extends Injected = Injected>(
        injected?: Injected,
        buildDefault?: () => Owned,
    ): OwnedOrInjected<Injected, Owned> {
        if (injected !== undefined) {
            return new OwnedOrInjected<Injected, Owned>(injected, false, true);
        }

        if (buildDefault !== undefined) {
            return new OwnedOrInjected<Injected, Owned>(buildDefault(), true, true);
        }

        return new OwnedOrInjected<Injected, Owned>(undefined, true, false);
    }

    /**
     * Whether the crawler owns the instance and is therefore responsible for its lifecycle. `true` only for
     * crawler-built defaults, `false` for user-injected instances.
     */
    get isOwned(): boolean {
        return this._owned;
    }

    /**
     * Whether a value is currently available. `false` for an owned slot whose default hasn't been built yet
     * (e.g. a lazily-opened request queue before its first use).
     */
    get isPresent(): boolean {
        return this._present;
    }

    /**
     * The resolved instance, typed as the public `Injected` type. Throws if the value is not present yet — callers that
     * expect a lazily-filled owned slot should read {@apilink OwnedOrInjected.maybeValue|`maybeValue`} instead.
     */
    get value(): Injected {
        if (!this._present) {
            throw new Error('OwnedOrInjected value is not initialized yet');
        }

        return this._value as Injected;
    }

    /**
     * The resolved instance, or `undefined` when a lazily-filled owned slot hasn't been built yet. The non-throwing
     * counterpart to {@apilink OwnedOrInjected.value|`value`} — pairs naturally with `?? fallback` so callers can read
     * a possibly-empty slot without the `isPresent ? value : …` dance.
     */
    get maybeValue(): Injected | undefined {
        return this._present ? (this._value as Injected) : undefined;
    }

    /**
     * Fills the (owned) slot with the crawler-built default, returning it for convenience. Only valid on an owned,
     * not-yet-filled slot: borrowed instances are never replaced and an owned slot is filled exactly once (re-setting
     * would silently orphan the previous instance's lifecycle).
     */
    set(value: Owned): Owned {
        if (!this._owned) {
            throw new Error('Cannot set() a borrowed OwnedOrInjected value');
        }

        if (this._present) {
            throw new Error('OwnedOrInjected value is already initialized');
        }

        this._value = value;
        this._present = true;

        return value;
    }

    /**
     * Runs an owned-only lifecycle hook, invoked (with the value typed as the concrete `Owned`) only when the crawler
     * owns a present instance — a no-op for a borrowed instance or an owned-but-not-yet-built slot.
     */
    async ifOwned<R>(fn: (value: Owned) => R | Promise<R>): Promise<R | undefined> {
        if (!this._owned || !this._present) {
            return undefined;
        }

        return fn(this._value as Owned);
    }
}

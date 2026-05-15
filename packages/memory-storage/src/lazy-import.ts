/**
 * Creates a lazy proxy for a module so that the underlying `require` is only
 * executed on first property access, call, or construction.
 *
 * @internal
 */
export function lazyImport<T extends object>(loader: () => unknown): T {
    let cached: any;
    const get = () => (cached ??= loader());
    return new Proxy(function () {} as any, {
        get: (_t, p) => (get() as any)[p],
        has: (_t, p) => p in (get() as any),
        apply: (_t, thisArg, args) => (get() as any).apply(thisArg, args),
        construct: (_t, args) => {
            const Ctor = get() as any;
            // eslint-disable-next-line new-cap
            return new Ctor(...args);
        },
        ownKeys: () => Reflect.ownKeys(get() as any),
        getOwnPropertyDescriptor: (_t, p) => Reflect.getOwnPropertyDescriptor(get() as any, p),
    }) as T;
}

/**
 * Defer loading a dependency until first use.
 *
 * Pass a thunk `() => import('pkg')`, not a string — the dynamic `import()`
 * is then evaluated at the caller's module location, so package resolution
 * works exactly the way a static `import 'pkg'` would there. The returned
 * function loads the module on first call and caches the result for the rest
 * of the process lifetime.
 *
 * Built on standard ESM `import()`, so it works in Node, Bun, Deno, and the
 * browser — no `node:module`/`createRequire` dependency.
 *
 * @example
 * ```ts
 * const cheerio = lazyImport(() => import('cheerio'));
 *
 * export async function htmlToText(html: string) {
 *     const $ = (await cheerio()).load(html);
 *     // ...
 * }
 * ```
 */
export function lazyImport<T>(load: () => Promise<T>): () => Promise<T> {
    let cached: T | undefined;
    let pending: Promise<T> | undefined;
    return async (): Promise<T> => {
        if (cached !== undefined) return cached;
        pending ??= load();
        cached = await pending;
        return cached;
    };
}

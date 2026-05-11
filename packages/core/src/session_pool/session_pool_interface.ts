import type { Session } from './session.js';

/**
 * Minimal contract that any object passed to a crawler as its `sessionPool` option must satisfy.
 *
 * Crawlers only depend on a tiny slice of the built-in {@apilink SessionPool}:
 * - {@apilink ISessionPool.getSession|`getSession()`} / `getSession(id)` to obtain a {@apilink Session} for a request,
 * - and the optional {@apilink ISessionPool.resetStore|`resetStore()`} / {@apilink ISessionPool.teardown|`teardown()`}
 *   lifecycle hooks, which the crawler only invokes when it owns the pool (i.e. when the user did not pass one in).
 *
 * Implement this interface to plug a custom session-management strategy into any Crawlee crawler — for example a
 * remote, multi-process pool, a database-backed pool, or a thin wrapper around {@apilink SessionPool} with different
 * rotation rules. The returned objects must be {@apilink Session} instances, since the rest of the crawler relies on
 * `session.markGood()`, `session.cookieJar`, `session.proxyInfo`, and other concrete `Session` API.
 *
 * @category Scaling
 */
export interface ISessionPool {
    /**
     * Returns a usable {@apilink Session}. Without an id, the pool decides which session to return (creating a new
     * one when appropriate). With an id, the pool returns the matching session if it is still usable, otherwise
     * `undefined`.
     */
    getSession(): Promise<Session>;
    getSession(sessionId: string): Promise<Session | undefined>;

    /**
     * Optional. Called by a crawler that owns this pool when {@apilink BasicCrawler.run|`crawler.run()`} is invoked
     * with `purgeRequestQueue: true`. Implementations that persist pool state should clear it here.
     */
    resetStore?(): Promise<void>;

    /**
     * Optional. Called by a crawler that owns this pool during {@apilink BasicCrawler.teardown|`crawler.teardown()`}.
     * Implementations should release resources and flush any pending persistence here.
     */
    teardown?(): Promise<void>;
}

import type { Session } from './session.js';

/**
 * Minimal contract that any object passed to a crawler as its `sessionPool` option must satisfy.
 *
 * Crawlers only depend on a single method of the built-in {@apilink SessionPool}: `getSession()` /
 * `getSession(id)` to hand out a {@apilink Session} for a request. Lifecycle (reset / teardown) is
 * the responsibility of whoever owns the pool — since a user-supplied pool is never owned by the
 * crawler, the crawler never tears it down.
 *
 * Implement this interface to plug a custom session-management strategy into any Crawlee crawler —
 * for example a remote, multi-process pool, a database-backed pool, or a thin wrapper around
 * {@apilink SessionPool} with different rotation rules. The returned objects must be
 * {@apilink Session} instances, since the rest of the crawler relies on `session.markGood()`,
 * `session.cookieJar`, `session.proxyInfo`, and other concrete `Session` API.
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
}

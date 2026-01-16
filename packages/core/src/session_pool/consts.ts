export const BLOCKED_STATUS_CODES = [401, 403, 429];
export const PERSIST_STATE_KEY = 'SDK_SESSION_POOL_STATE';
export const MAX_POOL_SIZE = 1000;

/**
 * Strategies for selecting sessions from the session pool.
 *
 * - `RANDOM` - Picks a random session from the pool (default behavior, same as before)
 * - `ROUND_ROBIN` - Sequentially rotates through sessions in order
 * - `USE_UNTIL_FAILURE` - Keeps using the same session until it fails or becomes unusable
 * - `LEAST_RECENTLY_USED` - Uses the session that hasn't been used for the longest time
 */
export enum SessionPoolReuseStrategy {
    /**
     * Picks a random session from the pool. This is the default strategy.
     */
    RANDOM = 'RANDOM',

    /**
     * Sequentially rotates through sessions in order, distributing usage evenly across all sessions.
     */
    ROUND_ROBIN = 'ROUND_ROBIN',

    /**
     * Keeps using the same session until it fails or becomes unusable, maximizing reuse of working sessions.
     */
    USE_UNTIL_FAILURE = 'USE_UNTIL_FAILURE',

    /**
     * Uses the session that hasn't been used for the longest time, helping to keep sessions fresh.
     */
    LEAST_RECENTLY_USED = 'LEAST_RECENTLY_USED',
}

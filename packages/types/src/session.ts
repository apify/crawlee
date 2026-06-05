import type { CookieJar, SerializedCookieJar } from 'tough-cookie';

/**
 * The main purpose of the ProxyInfo object is to provide information
 * about the current proxy connection used by the crawler for the request.
 * Outside of crawlers, you can get this object by calling {@apilink ProxyConfiguration.newProxyInfo}.
 *
 * **Example usage:**
 *
 * ```javascript
 * const proxyConfiguration = new ProxyConfiguration({
 *   proxyUrls: ['...', '...'] // List of Proxy URLs to rotate
 * });
 *
 * // Getting proxyInfo object by calling class method directly
 * const proxyInfo = await proxyConfiguration.newProxyInfo();
 *
 * // In crawler
 * const crawler = new CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   requestHandler({ proxyInfo }) {
 *      // Getting used proxy URL
 *       const proxyUrl = proxyInfo.url;
 *   }
 * })
 *
 * ```
 */
export interface ProxyInfo {
    /**
     * The URL of the proxy.
     */
    url: string;

    /**
     * Username for the proxy.
     */
    username?: string;

    /**
     * User's password for the proxy.
     */
    password: string;

    /**
     * Hostname of your proxy.
     */
    hostname: string;

    /**
     * Proxy port.
     */
    port: number | string;

    /**
     * When `true`, the proxy is likely intercepting HTTPS traffic and is able to view and modify its content.
     *
     * @default false
     */
    ignoreTlsErrors?: boolean;
}

/**
 * Identifies the browser-like profile a {@apilink Session} is impersonating, so
 * repeated requests with the same session look consistent to the target server.
 *
 * These fields are *hints* — `browser`, `platform`, `device`. Consumers
 * (`@crawlee/browser-pool`, `@crawlee/impit-client`, …) derive their own rich
 * state from them (e.g. a full browser fingerprint, a TLS impersonation profile)
 * and cache it on their own; the session itself is read-only intent.
 */
export interface SessionFingerprint {
    /** Browser family — consumed by HTTP clients that impersonate (e.g. `impit`). */
    browser?: 'chrome' | 'firefox' | 'safari' | 'edge';

    /** Platform hint — used by header generators and as a virtual session key. */
    platform?: 'windows' | 'macos' | 'linux' | 'android' | 'ios';

    /** Device class — drives header generation and viewport defaults. */
    device?: 'desktop' | 'mobile';
}

/**
 * Persistable {@apilink Session} state.
 */
export interface SessionState {
    id: string;
    cookieJar: SerializedCookieJar;
    proxyInfo?: ProxyInfo;
    userData: object;
    fingerprint?: SessionFingerprint;
    errorScore: number;
    maxErrorScore: number;
    errorScoreDecrement: number;
    usageCount: number;
    maxUsageCount: number;
    expiresAt: string;
    createdAt: string;
    retired: boolean;
}

/**
 * Sessions are used to store information such as cookies and can be used for generating fingerprints and proxy sessions.
 * You can imagine each session as a specific user, with its own cookies, IP (via proxy) and potentially a unique browser fingerprint.
 * Session internal state can be enriched with custom user data for example some authorization tokens and specific headers in general.
 * @category Scaling
 */
export interface ISession {
    readonly id: string;
    cookieJar: CookieJar;
    proxyInfo?: ProxyInfo;
    fingerprint?: SessionFingerprint;

    /**
     * Indicates whether the session can be used for next requests.
     * Session is usable when it is not expired, not blocked and the maximum usage count has not been reached.
     */
    isUsable(): boolean;

    /**
     * This method should be called after a successful session usage.
     */
    markGood(): void;

    /**
     * Marks session as blocked.
     * This method should be used if the session usage was unsuccessful
     * and you are sure that it is because of the session configuration and not any external matters.
     * For example when server returns 403 status code.
     * If the session does not work due to some external factors as server error such as 5XX you probably want to use `markBad` method.
     */
    retire(): void;

    /**
     * Increases usage and error count.
     * Should be used when the session has been used unsuccessfully. For example because of timeouts.
     */
    markBad(): void;
}

/**
 * Minimal contract that any object passed to a crawler as its `sessionPool` option must satisfy.
 *
 * Crawlers only depend on a single method of the built-in `SessionPool`: `getSession()` /
 * `getSession(id)` to hand out an {@apilink ISession} for a request. Lifecycle (reset, teardown)
 * is the responsibility of whoever owns the pool — since a user-supplied pool is never owned by
 * the crawler, the crawler never tears it down.
 *
 * Implement this interface to plug a custom session-management strategy into any Crawlee crawler —
 * for example a remote, multi-process pool, a database-backed pool, or a thin wrapper around the
 * built-in `SessionPool` with different rotation rules.
 *
 * @category Scaling
 */
export interface ISessionPool {
    /**
     * Returns a usable {@apilink ISession}. Without an id, the pool decides which session to return
     * (creating a new one when appropriate). With an id, the pool returns the matching session if
     * it is still usable.
     *
     * In case the `SessionPool` cannot provide a usable session given the configuration,
     * this method may return `undefined`.
     */
    getSession(sessionId?: string): Promise<ISession | undefined>;
}

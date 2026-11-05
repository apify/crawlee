/**
 * Cookie shape used by {@apilink CookieJar}. Structurally compatible with `tough-cookie`'s
 * `Cookie` class, so a `tough-cookie` cookie satisfies it without `@crawlee/types` depending
 * on `tough-cookie` itself.
 */
export interface SessionCookie {
    key: string;
    value: string;
    expires: Date | 'Infinity' | null;
    maxAge: number | 'Infinity' | '-Infinity' | null;
    domain: string | null;
    path: string | null;
    secure: boolean;
    httpOnly: boolean;
    extensions: string[] | null;
    creation: Date | 'Infinity' | null;
    creationIndex: number;
    hostOnly: boolean | null;
    pathIsDefault: boolean | null;
    lastAccessed: Date | 'Infinity' | null;
    sameSite: string | undefined;
    toJSON(): Record<string, unknown>;
    clone(): SessionCookie | undefined;
    validate(): boolean;
    setExpires(exp: string | Date): void;
    setMaxAge(age: number): void;
    cookieString(): string;
    toString(): string;
    TTL(now?: number): number;
    expiryTime(now?: Date): number | undefined;
    expiryDate(now?: Date): Date | undefined;
    isPersistent(): boolean;
    canonicalizedDomain(): string | undefined;
    cdomain(): string | undefined;
}

/**
 * Options for {@apilink CookieJar.setCookie}. Structurally compatible with `tough-cookie`'s
 * `SetCookieOptions`.
 */
export interface CookieJarSetCookieOptions {
    loose?: boolean;
    sameSiteContext?: 'strict' | 'lax' | 'none';
    ignoreError?: boolean;
    http?: boolean;
    now?: Date;
}

/**
 * Options for {@apilink CookieJar}'s cookie-reading methods. Structurally compatible with
 * `tough-cookie`'s `GetCookiesOptions`.
 */
export interface CookieJarGetCookiesOptions {
    http?: boolean;
    expire?: boolean;
    allPaths?: boolean;
    sameSiteContext?: 'none' | 'lax' | 'strict';
    sort?: boolean;
}

/**
 * Cookie jar contract, structurally compatible with `tough-cookie`'s `CookieJar` — which is
 * what backs {@apilink Session} by default — so `@crawlee/types` does not have to depend on
 * `tough-cookie` for it.
 */
export interface CookieJar {
    setCookie(
        cookie: string | SessionCookie,
        url: string | URL,
        options?: CookieJarSetCookieOptions,
    ): Promise<SessionCookie | undefined>;
    getCookies(url: string | URL, options?: CookieJarGetCookiesOptions): Promise<SessionCookie[]>;
    getCookieString(url: string | URL, options?: CookieJarGetCookiesOptions): Promise<string>;
    getSetCookieStrings(url: string | URL, options?: CookieJarGetCookiesOptions): Promise<string[] | undefined>;
    serialize(): Promise<SerializedCookieJar>;
    toJSON(): SerializedCookieJar | undefined;
    clone(): Promise<CookieJar>;
}

/**
 * JSON representation of a {@apilink CookieJar}. Structurally compatible with `tough-cookie`'s
 * `SerializedCookieJar`.
 */
export interface SerializedCookieJar {
    version: string;
    storeType: string | null;
    rejectPublicSuffixes: boolean;
    cookies: Record<string, unknown>[];
    [key: string]: unknown;
}

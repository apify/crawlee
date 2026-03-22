/**
 * A minimal logger interface used by low-level packages (http-client, memory-storage, utils)
 * that cannot depend on `@crawlee/core`. Structurally compatible with `CrawleeLogger`.
 */
export interface MinimalLogger {
    warning(message: string, data?: Record<string, unknown>): void;
}

/** @ignore */
export type Dictionary<T = any> = Record<PropertyKey, T>;

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

export type AllowedHttpMethods =
    | 'GET'
    | 'HEAD'
    | 'POST'
    | 'PUT'
    | 'DELETE'
    | 'TRACE'
    | 'OPTIONS'
    | 'CONNECT'
    | 'PATCH'
    | 'get'
    | 'head'
    | 'post'
    | 'put'
    | 'delete'
    | 'trace'
    | 'options'
    | 'connect'
    | 'patch';

/** @ignore */
export type Dictionary<T = any> = Record<PropertyKey, T>;

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

export type AllowedHttpMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';

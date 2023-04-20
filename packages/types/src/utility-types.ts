import type { Request } from '@crawlee/core';

/** @ignore */
export type Dictionary<T = any> = Record<PropertyKey, T>;

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

export type AllowedHttpMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';

export type RouterRoutes<Context, UserData extends Dictionary> = {
    [label in string | symbol]: (ctx: Omit<Context, 'request'> & { request: Request<UserData> }) => Awaitable<void>;
}

export type GetUserDataFromRequest<T> = T extends Request<infer Y> ? Y : never;

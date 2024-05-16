/* eslint-disable @typescript-eslint/ban-types */

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

/** @ignore */
export function entries<T extends {}>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/** @ignore */
export function keys<T extends {}>(obj: T) {
    return Object.keys(obj) as (keyof T)[];
}

export declare type AllowedHttpMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';

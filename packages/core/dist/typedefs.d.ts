/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;
/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;
/** @ignore */
export declare function entries<T extends {}>(obj: T): [keyof T, T[keyof T]][];
/** @ignore */
export declare function keys<T extends {}>(obj: T): (keyof T)[];
export declare type AllowedHttpMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'TRACE' | 'OPTIONS' | 'CONNECT' | 'PATCH';
//# sourceMappingURL=typedefs.d.ts.map
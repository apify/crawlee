export type Dictionary<T = any> = Record<PropertyKey, T>;

export type Constructor<T = unknown> = new (...args: any[]) => T;

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

import type { Readable } from 'stream';
import type { Primitive } from 'type-fest';
import type { CookieJar } from 'tough-cookie';

type Timeout =
    | {
          lookup: number;
          connect: number;
          secureConnect: number;
          socket: number;
          send: number;
          response: number;
      }
    | { request: number };

type Method =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'HEAD'
    | 'DELETE'
    | 'OPTIONS'
    | 'TRACE'
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'head'
    | 'delete'
    | 'options'
    | 'trace';

export type ResponseTypes = {
    'json': unknown;
    'text': string;
    'buffer': Buffer;
};

// Omitted (https://github.com/sindresorhus/got/blob/main/documentation/2-options.md):
//  - decompress,
//  - resolveBodyOnly,
//  - allowGetBody,
//  - dnsLookup,
//  - dnsCache,
//  - dnsLookupIpVersion,
//  - retry,
//  - hooks,
//  - parseJson,
//  - stringifyJson,
//  - request,
//  - cache,
//  - cacheOptions,
//  - http2
//  - https
//  - agent
//  - localAddress
//  - createConnection
//  - pagination
//  - setHost
//  - maxHeaderSize
//  - methodRewriting
//  - enableUnixSockets
//  - context
export interface HttpRequest<TResponseType extends keyof ResponseTypes = 'text'> {
    [k: string]: unknown; // TODO BC with got - remove in 4.0

    url: string | URL;
    method?: Method;
    searchParams?: string | URLSearchParams | Record<string, Primitive>;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    body?: string | Buffer | Readable | Generator | AsyncGenerator | FormData;
    form?: Record<string, string>;
    json?: unknown;

    username?: string;
    password?: string;

    cookieJar?: Record<string, string> | CookieJar;
    followRedirect?: boolean | ((response: HttpResponse<TResponseType>) => boolean);
    maxRedirects?: number;

    timeout?: Timeout;

    encoding?: string;
    responseType?: TResponseType;
    throwHttpErrors?: boolean;

    // from got-scraping Context
    proxyUrl?: string;
    headerGeneratorOptions?: Record<string, unknown>;
    useHeaderGenerator?: boolean;
    headerGenerator?: {
        getHeaders: (options: Record<string, unknown>) => Record<string, string>;
    };
    insecureHTTPParser?: boolean;
    sessionToken?: object;
}

export interface HttpResponse<TResponseType extends keyof ResponseTypes> {
    request: HttpRequest<TResponseType>;

    redirectUrls: URL[];
    url: string;

    ip?: string;
    statusCode: number;

    body: ResponseTypes[TResponseType];
}

export abstract class BaseHttpClient {
    abstract sendRequest<TResponseType extends keyof ResponseTypes>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>>;
}

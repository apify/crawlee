/// <reference types="node" />
import type { IncomingMessage } from 'node:http';
import type { Dictionary, AllowedHttpMethods } from '@crawlee/types';
interface BrowserResponseLike {
    status(): number;
}
interface Request<UserData extends Dictionary = Dictionary> {
    id?: string;
    url: string;
    loadedUrl?: string;
    uniqueKey: string;
    method: AllowedHttpMethods;
    payload?: string;
    noRetry: boolean;
    retryCount: number;
    errorMessages: string[];
    headers?: Record<string, string>;
    userData: UserData;
    handledAt?: string;
}
/**
 * Creates a standardized debug info from request and response. This info is usually added to dataset under the hidden `#debug` field.
 *
 * @param request [Request](https://sdk.apify.com/docs/api/request) object.
 * @param [response]
 *   Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&version=v1.11.0&show=api-class-response)
 *   or NodeJS [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_serverresponse).
 * @param [additionalFields] Object containing additional fields to be added.
 */
export declare function createRequestDebugInfo(request: Request, response?: IncomingMessage | Partial<BrowserResponseLike>, additionalFields?: Dictionary): Dictionary;
export {};
//# sourceMappingURL=debug.d.ts.map
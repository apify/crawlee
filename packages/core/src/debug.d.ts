import type { IncomingMessage } from 'node:http';
import type { Dictionary } from '@crawlee/types';
import type { Request } from './request.js';
interface BrowserResponseLike {
    status(): number;
}
/**
 * Creates a standardized debug info from request and response. This info is usually added to dataset under the hidden `#debug` field.
 *
 * @param request [Request](https://sdk.apify.com/docs/api/request) object.
 * @param [response]
 *   Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&version=v1.11.0&show=api-class-response)
 *   or NodeJS [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_serverresponse).
 * @param [additionalFields] Object containing additional fields to be added.
 *
 * @internal
 */
export declare function createRequestDebugInfo(request: Request, response?: IncomingMessage | Partial<BrowserResponseLike>, additionalFields?: Dictionary): Dictionary;
/**
 * Returns a human-readable label for an unknown value,
 * suitable for embedding in error messages and log output.
 *
 * Returns `constructor.name` when available (e.g. `"Configuration"`, `"Number"`),
 * otherwise falls back to `util.inspect` (e.g. for `null`, `undefined`).
 *
 * @internal
 */
export declare function inspectValue(value: unknown): string;
/**
 * Returns the type of a value as a lowercase string, with `Date`, `Buffer` and `RegExp` reported
 * by their constructor name. Used for building validation error messages.
 *
 * @internal
 */
export declare function getObjectType(value: unknown): string;
export {};

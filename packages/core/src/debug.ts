import type { IncomingMessage } from 'node:http';
import { inspect } from 'node:util';

import type { Dictionary } from '@crawlee/types';

import type { Request } from './request.js';
import { parseArgument, schemas } from './validators.js';

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
export function createRequestDebugInfo(
    request: Request,
    response: IncomingMessage | Partial<BrowserResponseLike> = {},
    additionalFields: Dictionary = {},
): Dictionary {
    parseArgument(request, schemas.anyObject);
    parseArgument(response, schemas.anyObject);
    parseArgument(additionalFields, schemas.anyObject);

    return {
        requestId: request.id,
        url: request.url,
        loadedUrl: request.loadedUrl,
        method: request.method,
        retryCount: request.retryCount,
        errorMessages: request.errorMessages,
        // Puppeteer response has .status() function and NodeJS response, statusCode property.
        statusCode:
            'status' in response && response.status instanceof Function
                ? response.status()
                : (response as IncomingMessage).statusCode,
        ...additionalFields,
    };
}

/**
 * Returns a human-readable label for an unknown value,
 * suitable for embedding in error messages and log output.
 *
 * Returns `constructor.name` when available (e.g. `"Configuration"`, `"Number"`),
 * otherwise falls back to `util.inspect` (e.g. for `null`, `undefined`).
 *
 * @internal
 */
export function inspectValue(value: unknown): string {
    if (typeof value === 'object' && value !== null && value.constructor?.name) {
        return value.constructor.name;
    }

    return inspect(value, {
        depth: 0,
        compact: true,
        maxStringLength: 64,
        breakLength: Infinity,
        colors: false,
    });
}

/**
 * Returns the type of a value as a lowercase string, with `Date`, `Buffer` and `RegExp` reported
 * by their constructor name. Used for building validation error messages.
 *
 * @internal
 */
export function getObjectType(value: unknown): string {
    const simple = typeof value;

    if (['string', 'number', 'boolean', 'bigint'].includes(simple)) {
        return simple;
    }

    const objectType = Object.prototype.toString.call(value);
    const type = /\[object (\w+)]/.exec(objectType)![1];

    if (type === 'Uint8Array') {
        return 'Buffer';
    }

    return ['Date', 'Buffer', 'RegExp'].includes(type) ? type : type.toLowerCase();
}

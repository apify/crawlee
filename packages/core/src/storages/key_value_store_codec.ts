import type { Dictionary } from '@crawlee/types';
import contentTypeParser from 'content-type';
import { isBuffer, isStream } from '@crawlee/utils';
import JSON5 from 'json5';

import { jsonStringifyExtended } from '@apify/utilities';

const CONTENT_TYPE_JSON = 'application/json';
const STRINGIFIABLE_CONTENT_TYPE_RXS = [new RegExp(`^${CONTENT_TYPE_JSON}$`, 'i'), /^application\/.*xml$/i, /^text\//i];

/**
 * Canonical write path for key-value store records.
 *
 * When a content type is provided, the value passes through unchanged — it is the caller's
 * responsibility to supply a String/Buffer/Stream (the frontend validates this).
 *
 * When no content type is provided, it is inferred from the value's shape:
 * - Buffer / typed array / ArrayBuffer / stream → `application/octet-stream` (passthrough)
 * - `string` → `text/plain; charset=utf-8` (passthrough)
 * - anything else → `application/json; charset=utf-8` (serialized via `jsonStringifyExtended`)
 *
 * Does NOT drain streams — that is storage mechanics and stays in the storage client.
 *
 * Backend-independent.
 */
export function serializeValue(
    value: unknown,
    contentType?: string,
): {
    value: Buffer | ArrayBuffer | ArrayBufferView | string | NodeJS.ReadableStream | ReadableStream;
    contentType: string;
} {
    if (contentType !== null && contentType !== undefined) {
        return { value: value as Buffer | string | NodeJS.ReadableStream | ReadableStream, contentType };
    }

    if (isStream(value) || isBuffer(value)) {
        return {
            value,
            contentType: 'application/octet-stream',
        };
    }

    if (typeof value === 'string') {
        return { value, contentType: 'text/plain; charset=utf-8' };
    }

    let serialized: string;
    try {
        // Format JSON to simplify debugging, the overheads with compression is negligible
        serialized = jsonStringifyExtended(value as Dictionary, null, 2);
    } catch (e) {
        const error = e as Error;
        // Give more meaningful error message
        if (error.message?.includes('Invalid string length')) {
            error.message = 'Object is too large';
        }
        throw new Error(`The "value" parameter cannot be stringified to JSON: ${error.message}`);
    }

    if (serialized === undefined) {
        throw new Error(
            'The "value" parameter was stringified to JSON and returned undefined. ' +
                "Make sure you're not trying to stringify an undefined value.",
        );
    }

    return { value: serialized, contentType: 'application/json; charset=utf-8' };
}

/**
 * Parses a Buffer or ArrayBuffer using the provided content type header.
 *
 * - application/json is returned as a parsed object.
 * - application/*xml and text/* are returned as strings.
 * - everything else is returned as original body.
 *
 * If the header includes a charset, the body will be stringified only
 * if the charset represents a known encoding to Node.js or Browser.
 *
 * Backend-independent — this is the canonical read path for the {@apilink KeyValueStore} frontend.
 */
export function parseValue(
    body: Buffer | ArrayBuffer | string,
    contentTypeHeader: string | null,
): string | Buffer | ArrayBuffer | Record<string, unknown> {
    // No content type at all → we have no basis for interpretation; hand back the raw value.
    if (contentTypeHeader === null) return body;

    let contentType: string;
    let charset: BufferEncoding;
    try {
        const result = contentTypeParser.parse(contentTypeHeader);
        contentType = result.type;
        charset = result.parameters.charset as BufferEncoding;
    } catch {
        // Unparseable header → keep the original value rather than a mangled string.
        return body;
    }

    // If we can't successfully interpret it, we return the original value rather than mangling it.
    if (!areDataStringifiable(contentType, charset)) return body;

    // Decode raw bytes using the resolved charset. An already-decoded string passes through (callers
    // may hand us one directly), avoiding a needless re-encode round-trip.
    const dataString = typeof body === 'string' ? body : isomorphicBufferToString(body, charset);

    return contentType === CONTENT_TYPE_JSON ? JSON5.parse(dataString) : dataString;
}

function isomorphicBufferToString(buffer: Buffer | ArrayBuffer, encoding: BufferEncoding): string {
    if (buffer.constructor.name !== ArrayBuffer.name) {
        return buffer.toString(encoding);
    }

    // Browser decoding only works with UTF-8.
    const utf8decoder = new TextDecoder();
    return utf8decoder.decode(new Uint8Array(buffer));
}

function isCharsetStringifiable(charset: string): charset is BufferEncoding {
    if (!charset) return true; // hope that it's utf-8
    return Buffer.isEncoding(charset);
}

function isContentTypeStringifiable(contentType: string): boolean {
    if (!contentType) return false; // keep buffer
    return STRINGIFIABLE_CONTENT_TYPE_RXS.some((rx) => rx.test(contentType));
}

function areDataStringifiable(contentType: string, charset: string): boolean {
    return isContentTypeStringifiable(contentType) && isCharsetStringifiable(charset);
}

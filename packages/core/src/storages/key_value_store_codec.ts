import type { Dictionary } from '@crawlee/types';
import contentTypeParser from 'content-type';
import JSON5 from 'json5';

import { jsonStringifyExtended } from '@apify/utilities';

const CONTENT_TYPE_JSON = 'application/json';
const STRINGIFIABLE_CONTENT_TYPE_RXS = [new RegExp(`^${CONTENT_TYPE_JSON}$`, 'i'), /^application\/.*xml$/i, /^text\//i];

/**
 * Canonical write path for key-value store records. When a content type is provided, the value is
 * taken as-is; when it is absent, the value is serialized to JSON and the content type is set to
 * `application/json; charset=utf-8`.
 *
 * Does NOT drain streams — that is storage mechanics and stays in the storage client.
 *
 * Backend-independent.
 */
export function serializeValue(
    value: unknown,
    contentType?: string,
): { value: Buffer | string | NodeJS.ReadableStream; contentType: string } {
    // When an explicit content type is provided, the value is taken as-is — it is the caller's
    // responsibility to pass a String/Buffer/Stream (the frontend validates this). When no content
    // type is provided, the value is serialized to JSON.
    if (contentType !== null && contentType !== undefined) {
        return { value: value as Buffer | string | NodeJS.ReadableStream, contentType };
    }

    const resolvedContentType = 'application/json; charset=utf-8';

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

    return { value: serialized, contentType: resolvedContentType };
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
    body: Buffer | ArrayBuffer,
    contentTypeHeader: string,
): string | Buffer | ArrayBuffer | Record<string, unknown> {
    let contentType: string;
    let charset: BufferEncoding;
    try {
        const result = contentTypeParser.parse(contentTypeHeader);
        contentType = result.type;
        charset = result.parameters.charset as BufferEncoding;
    } catch {
        // can't parse, keep original body
        return body;
    }

    // If we can't successfully parse it, we return
    // the original buffer rather than a mangled string.
    if (!areDataStringifiable(contentType, charset)) return body;
    const dataString = isomorphicBufferToString(body, charset);

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

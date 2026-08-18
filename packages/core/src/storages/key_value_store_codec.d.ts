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
 * Does NOT drain streams — that is storage mechanics and stays in the storage backend.
 *
 * Backend-independent.
 */
export declare function serializeValue(value: unknown, contentType?: string): {
    value: Buffer | ArrayBuffer | ArrayBufferView | string | NodeJS.ReadableStream | ReadableStream;
    contentType: string;
};
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
export declare function parseValue(body: Buffer | ArrayBuffer | string, contentTypeHeader: string | null): string | Buffer | ArrayBuffer | Record<string, unknown>;

/// <reference types="node" />
/**
 * Parses a Buffer or ArrayBuffer using the provided content type header.
 *
 * - application/json is returned as a parsed object.
 * - application/*xml and text/* are returned as strings.
 * - everything else is returned as original body.
 *
 * If the header includes a charset, the body will be stringified only
 * if the charset represents a known encoding to Node.js or Browser.
 */
export declare function maybeParseBody(body: Buffer | ArrayBuffer, contentTypeHeader: string): string | Buffer | ArrayBuffer | Record<string, unknown>;
//# sourceMappingURL=body-parser.d.ts.map
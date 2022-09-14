import contentTypeParser from 'content-type';
import JSON5 from 'json5';

const CONTENT_TYPE_JSON = 'application/json';
const STRINGIFIABLE_CONTENT_TYPE_RXS = [
    new RegExp(`^${CONTENT_TYPE_JSON}$`, 'i'),
    /^application\/.*xml$/i,
    /^text\//i,
];

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
export function maybeParseBody(body: Buffer | ArrayBuffer, contentTypeHeader: string): string | Buffer | ArrayBuffer | Record<string, unknown> {
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

    return contentType === CONTENT_TYPE_JSON
        ? JSON5.parse(dataString)
        : dataString;
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

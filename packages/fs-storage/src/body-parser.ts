import contentTypeParser from 'content-type';
import JSON5 from 'json5';

const CONTENT_TYPE_JSON = 'application/json';
const STRINGIFIABLE_CONTENT_TYPE_RXS = [new RegExp(`^${CONTENT_TYPE_JSON}$`, 'i'), /^application\/.*xml$/i, /^text\//i];

/**
 * Validity guard for the bare-file fallback. Throws if `body` cannot be parsed for the given content
 * type, so that an unparseable on-disk value (e.g. malformed JSON) can be treated as a missing
 * record. Actual parsing of the bytes is the {@apilink KeyValueStore} frontend's job; this client is
 * a plain byte transport, so we only validate here and return the raw bytes.
 *
 * Mirrors the frontend `parseValue` codec: JSON is `JSON5.parse`d (and must succeed), `*xml` and
 * `text/*` are decoded as strings, and everything else is left untouched (always valid).
 */
export function isBodyParseable(body: Buffer | ArrayBuffer, contentTypeHeader: string): void {
    let contentType: string;
    let charset: BufferEncoding;
    try {
        const result = contentTypeParser.parse(contentTypeHeader);
        contentType = result.type;
        charset = result.parameters.charset as BufferEncoding;
    } catch {
        // Can't parse the content type header — keep the raw body, nothing to validate.
        return;
    }

    // Non-stringifiable types are returned as raw bytes by the frontend; nothing to validate.
    if (!areDataStringifiable(contentType, charset)) return;
    const dataString = isomorphicBufferToString(body, charset);

    // For JSON we must ensure the body actually parses; a throw here flags an unparseable record.
    if (contentType === CONTENT_TYPE_JSON) JSON5.parse(dataString);
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

import contentTypeParser from 'content-type';
import JSON5 from 'json5';

export function isStream(value: any): boolean {
    return (
        typeof value === 'object' &&
        value &&
        ['on', 'pipe'].every((key) => key in value && typeof value[key] === 'function')
    );
}

const CONTENT_TYPE_JSON = 'application/json';

/**
 * Validity guard for the bare-file fallback. Throws if `body` cannot be parsed for the given content
 * type, so that an unparseable on-disk value (e.g. malformed JSON) can be treated as a missing
 * record. Actual parsing of the bytes is the {@apilink KeyValueStore} frontend's job; this client is
 * a plain byte transport, so we only validate here.
 *
 * In practice JSON is the only content type that can fail validation — it must `JSON5.parse`
 * successfully. Everything else is always considered valid.
 */
export function assertBodyParseable(body: Buffer, contentTypeHeader: string): void {
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

    if (contentType !== CONTENT_TYPE_JSON) return;
    if (charset && !Buffer.isEncoding(charset)) return; // unknown charset, can't decode — leave as-is

    // A throw here flags an unparseable record.
    JSON5.parse(body.toString(charset || 'utf-8'));
}

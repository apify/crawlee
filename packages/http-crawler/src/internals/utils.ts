import { extname } from 'node:path';

import { parseArgument } from '@crawlee/utils/internal';
import { isTypeValid, parse as parseContentType } from 'content-type';
import mime from 'mime-types';
import { z } from 'zod';

const responseWithUrlSchema = z.looseObject({ url: z.url(), headers: z.looseObject({}) });

/**
 * Scans the first 1024 bytes of an HTML document (as latin1) to extract the charset
 * declared via `<meta charset>` or `<meta http-equiv="Content-Type" content="...;charset=...">`.
 * This implements a simplified version of the HTML spec's byte-stream prescan algorithm.
 */
export function extractCharsetFromHtmlBytes(bytes: Buffer): string | undefined {
    // latin1 preserves byte values for ASCII-compatible encodings, making the meta tags readable
    const prescan = bytes.subarray(0, 1024).toString('latin1');
    const match = /<meta[^>]+\bcharset\s*=\s*["']?\s*([^"'\s;>]+)/i.exec(prescan);
    return match?.[1];
}

/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
export function parseContentTypeFromResponse(response: Response): { type: string; charset: BufferEncoding } {
    parseArgument(response, responseWithUrlSchema);

    const { url, headers } = response;
    let parsedContentType;

    if (headers.get('content-type')) {
        const parsed = parseContentType(headers.get('content-type') as string);
        // Can not parse content type from Content-Type header. Try to parse it from file extension.
        if (isTypeValid(parsed.type)) parsedContentType = parsed;
    }

    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname =
            mime.contentType(extname(parsedUrl.pathname)) || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = parseContentType(contentTypeFromExtname);
    }

    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset as BufferEncoding,
    };
}

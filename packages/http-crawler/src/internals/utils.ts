import { extname } from 'node:path';

import contentTypeParser from 'content-type';
import mime from 'mime-types';
import ow, { ObjectPredicate } from 'ow';

/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
export function parseContentTypeFromResponse(response: unknown): { type: string; charset: BufferEncoding } {
    ow(
        response,
        ow.object.partialShape({
            url: ow.string.url,
            headers: new ObjectPredicate<Record<string, unknown>>(),
        }),
    );

    const { url, headers } = response;
    let parsedContentType;

    if (headers['content-type']) {
        try {
            parsedContentType = contentTypeParser.parse(headers['content-type'] as string);
        } catch {
            // Can not parse content type from Content-Type header. Try to parse it from file extension.
        }
    }

    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname =
            mime.contentType(extname(parsedUrl.pathname)) || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = contentTypeParser.parse(contentTypeFromExtname);
    }

    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset as BufferEncoding,
    };
}

import type { HttpRequest, HttpRequestOptions } from '@crawlee/types';
/**
 * Converts {@apilink HttpRequestOptions} to a {@apilink HttpRequest}.
 */
export declare function processHttpRequestOptions({ searchParams, form, json, username, password, ...request }: HttpRequestOptions): HttpRequest;
/**
 * Scans the first 1024 bytes of an HTML document (as latin1) to extract the charset
 * declared via `<meta charset>` or `<meta http-equiv="Content-Type" content="...;charset=...">`.
 * This implements a simplified version of the HTML spec's byte-stream prescan algorithm.
 */
export declare function extractCharsetFromHtmlBytes(bytes: Buffer): string | undefined;
/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
export declare function parseContentTypeFromResponse(response: Response): {
    type: string;
    charset: BufferEncoding;
};

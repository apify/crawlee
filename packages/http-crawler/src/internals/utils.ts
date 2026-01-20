import { extname } from 'node:path';
import { Readable } from 'node:stream';

import type { HttpRequest, HttpRequestOptions } from '@crawlee/types';
import { applySearchParams } from '@crawlee/utils';
import contentTypeParser from 'content-type';
import mime from 'mime-types';
import ow, { ObjectPredicate } from 'ow';

/**
 * Converts {@apilink HttpRequestOptions} to a {@apilink HttpRequest}.
 */
export function processHttpRequestOptions({
    searchParams,
    form,
    json,
    username,
    password,
    ...request
}: HttpRequestOptions): HttpRequest {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);

    applySearchParams(url, searchParams);

    if ([request.body, form, json].filter((value) => value !== undefined).length > 1) {
        throw new Error('At most one of `body`, `form` and `json` may be specified in sendRequest arguments');
    }

    const body = (() => {
        if (form !== undefined) {
            return Readable.from(new URLSearchParams(form).toString());
        }

        if (json !== undefined) {
            return Readable.from(JSON.stringify(json));
        }

        if (request.body !== undefined) {
            return Readable.from(request.body);
        }

        return undefined;
    })();

    if (form !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/x-www-form-urlencoded');
    }

    if (json !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    if (username !== undefined || password !== undefined) {
        const encodedAuth = Buffer.from(`${username ?? ''}:${password ?? ''}`).toString('base64');
        headers.set('authorization', `Basic ${encodedAuth}`);
    }

    return { ...request, body, url, headers };
}

/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 */
export function parseContentTypeFromResponse(response: Response): { type: string; charset: BufferEncoding } {
    ow(
        response,
        ow.object.partialShape({
            url: ow.string.url,
            headers: new ObjectPredicate<Record<string, unknown>>(),
        }),
    );

    const { url, headers } = response;
    let parsedContentType;

    if (headers.get('content-type')) {
        try {
            parsedContentType = contentTypeParser.parse(headers.get('content-type') as string);
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

import { Readable } from 'node:stream';

import type { HttpRequest, HttpRequestOptions, IResponseWithUrl } from '@crawlee/types';
import { applySearchParams } from '@crawlee/utils';

export class ResponseWithUrl extends Response implements IResponseWithUrl {
    override url: string;
    constructor(body: BodyInit | null, init: ResponseInit & { url?: string }) {
        super(body, init);
        this.url = init.url ?? '';
    }
}

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

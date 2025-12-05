import type { BaseHttpClient, SendRequestOptions, StreamOptions } from '@crawlee/core';

export class FetchHttpClient implements BaseHttpClient {
    async sendRequest(request: Request, options?: SendRequestOptions): Promise<Response> {
        const signal = options?.timeout ? AbortSignal.timeout(options.timeout ?? 0) : undefined;
        return fetch(request, {
            signal,
        });
    }

    async stream(request: Request, options: StreamOptions): Promise<Response> {
        const signal = options?.timeout ? AbortSignal.timeout(options.timeout ?? 0) : undefined;
        return fetch(request, {
            signal,
        });
    }
}

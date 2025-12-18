import type { BaseHttpClient, SendRequestOptions, StreamOptions } from '@crawlee/types';

export class FetchHttpClient implements BaseHttpClient {
    async sendRequest(request: Request, options?: SendRequestOptions): Promise<Response> {
        const signal = AbortSignal.timeout(options?.timeout ?? 30000);
        const response = await fetch(request, { signal });
        return response;
    }

    async stream(request: Request, options?: StreamOptions): Promise<Response> {
        return this.sendRequest(request, options);
    }
}

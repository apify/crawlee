import { Readable } from 'stream';

import { CheerioCrawler, Dictionary } from '@crawlee/cheerio';
import {
    BaseHttpClient,
    BaseHttpResponseData,
    HttpRequest,
    HttpResponse,
    RedirectHandler,
    ResponseTypes,
    StreamingHttpResponse,
} from '@crawlee/core';
import { Actor } from 'apify';
import { CurlImpersonate } from 'apify-node-curl-impersonate';

if (process.env.STORAGE_IMPLEMENTATION === 'LOCAL') {
    // @ts-ignore
    await Actor.init({ storage: new (await import('@apify/storage-local')).ApifyStorageLocal() });
} else {
    await Actor.init();
}

interface CurlImpersonateHttpClientOptions {
    impersonate?: ConstructorParameters<typeof CurlImpersonate>[1]['impersonate'];
}

type CurlResponse = Awaited<ReturnType<CurlImpersonate['makeRequest']>>;

class CurlImpersonateHttpClient implements BaseHttpClient {
    constructor(private options: CurlImpersonateHttpClientOptions = {}) {}

    protected async curlOptionsForRequest(request: HttpRequest<any>) {
        const result = {
            method: request.method ?? 'get',
            headers: request.headers ?? {},
            flags: ['--compressed'],
            impersonate: this.options.impersonate,
            debugLogger: () => {},
        };

        if (request.proxyUrl !== undefined) {
            result.flags.push('--proxy', request.proxyUrl);
        }

        if (request.cookieJar) {
            result.headers['set-cookie'] = await Promise.resolve(
                request.cookieJar.getCookieString(request.url.toString(), {}, () => {}),
            );
        }

        return result;
    }

    protected shouldRedirect(request: HttpRequest, response: CurlResponse, redirectUrls: URL[]): boolean {
        if (request.maxRedirects !== undefined && request.maxRedirects <= redirectUrls.length) {
            return false;
        }

        if (request.followRedirect instanceof Function) {
            return request.followRedirect(response);
        }

        return request.followRedirect === undefined || request.followRedirect;
    }

    protected async performRequest(request: HttpRequest<any>, onRedirect?: RedirectHandler) {
        let response: CurlResponse | undefined;
        const redirectUrls: URL[] = [];

        const updatedRequest: Required<Pick<HttpRequest, 'url' | 'headers'>> = {
            url: request.url.toString(),
            headers: {},
        };

        while (true) {
            const impersonate = new CurlImpersonate(updatedRequest.url.toString(), {
                ...(await this.curlOptionsForRequest(request)),
                followRedirects: false,
            });

            response = await impersonate.makeRequest();

            if (response.statusCode >= 300 && response.statusCode < 400) {
                if (!this.shouldRedirect(request, response, redirectUrls)) {
                    break;
                }

                updatedRequest.url = response.responseHeaders.location;
                updatedRequest.headers = response.responseHeaders;
                redirectUrls.push(new URL(updatedRequest.url));
                onRedirect?.(this.transformResponse(response, redirectUrls), updatedRequest);
            } else if (request.throwHttpErrors !== false && response.statusCode >= 400) {
                throw Object.assign(new Error(`Error status code encountered - ${response.statusCode}`), {
                    request,
                    response,
                });
            } else {
                break;
            }
        }

        return { ...response, redirectUrls };
    }

    protected transformResponse(response: CurlResponse, redirectUrls: URL[]): BaseHttpResponseData {
        return {
            redirectUrls,
            url: response.url,
            ip: response.ipAddress,
            statusCode: response.statusCode,
            headers: response.responseHeaders,
            trailers: {}, // TODO apify-node-curl-impersonate doesn't seem to expose this
            complete: true,
        };
    }

    async sendRequest<TResponseType extends keyof ResponseTypes = 'text'>(
        request: HttpRequest<TResponseType>,
    ): Promise<HttpResponse<TResponseType>> {
        const response = await this.performRequest(request);

        const body = ((): ResponseTypes[TResponseType] => {
            const buffer = Buffer.from(response.response, request.encoding);

            switch (request.responseType) {
                case 'buffer':
                    return buffer as ResponseTypes[TResponseType];
                case 'json':
                    return JSON.parse(buffer.toString());
                default:
                    return buffer.toString() as ResponseTypes[TResponseType];
            }
        })();

        return {
            request,
            body,
            ...this.transformResponse(response, response.redirectUrls),
        };
    }

    async stream(request: HttpRequest, onRedirect?: RedirectHandler): Promise<StreamingHttpResponse> {
        const response = await this.performRequest(request, onRedirect);

        const stream = new Readable();
        stream.push(response.response);
        stream.push(null);

        return {
            request,
            url: response.url,
            ip: response.ipAddress,
            statusCode: response.statusCode,
            stream,
            complete: true,
            downloadProgress: { percent: 100, transferred: response.response.length },
            uploadProgress: { percent: 100, transferred: 0 },
            redirectUrls: response.redirectUrls,
            headers: response.responseHeaders,
            trailers: {},
        };
    }
}

const crawler = new CheerioCrawler({
    async requestHandler(context) {
        const { body: text } = await context.sendRequest({
            url: 'https://httpbin.org/uuid',
        });

        const { body: json } = await context.sendRequest({
            url: 'https://httpbin.org/uuid',
            responseType: 'json',
        });

        const { body: ua } = await context.sendRequest<Dictionary>({
            url: 'https://httpbin.org/user-agent',
            responseType: 'json',
        });

        await context.pushData({
            body: context.body,
            title: context.$('title').text(),
            userAgent: ua['user-agent'],
            uuidTextResponse: text,
            uuidJsonResponse: json,
        });
    },
    httpClient: new CurlImpersonateHttpClient({ impersonate: 'chrome-116' }),
});

await crawler.run(['https://httpbin.org/']);

await Actor.exit({ exit: Actor.isAtHome() });

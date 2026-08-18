import type { Request as CrawleeRequest } from '@crawlee/core';
import type { BaseHttpClient } from '@crawlee/http-client';
import type { HttpRequestOptions, ISession, SendRequestOptions } from '@crawlee/types';
/**
 * Prepares a function to be used as the `sendRequest` context helper.
 *
 * @internal
 * @param httpClient The HTTP client that will perform the requests.
 * @param originRequest The crawling request being processed.
 * @param session The user session associated with the current request.
 */
export declare function createSendRequest(httpClient: BaseHttpClient, originRequest: CrawleeRequest, session: ISession): (overrideRequest?: Partial<HttpRequestOptions>, overrideOptions?: SendRequestOptions) => Promise<Response>;

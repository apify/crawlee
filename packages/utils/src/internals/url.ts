import { type BaseHttpClient, GotScrapingHttpClient } from 'crawlee';

export type SearchParams = string | URLSearchParams | Record<string, string | number | boolean | null | undefined>;

/**
 * Appends search (query string) parameters to a URL, replacing the original value (if any).
 *
 * @param url The URL to append to.
 * @param searchParams The search parameters to be appended.
 * @internal
 */
export function applySearchParams(url: URL, searchParams: SearchParams | undefined): void {
    if (searchParams === undefined) {
        return;
    }

    if (typeof searchParams === 'string') {
        url.search = searchParams;
        return;
    }

    let newSearchParams: URLSearchParams;

    if (searchParams instanceof URLSearchParams) {
        newSearchParams = searchParams;
    } else {
        newSearchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(newSearchParams)) {
            if (value === undefined) {
                newSearchParams.delete(key);
            } else if (value === null) {
                newSearchParams.append(key, '');
            } else {
                newSearchParams.append(key, value as string);
            }
        }
    }

    url.search = newSearchParams.toString();
}

/**
 * Check if a document with the given URL exists by making a `HEAD` request to it.
 * @param url The URL to check.
 * @param proxyUrl The proxy URL to use for the request.
 * @returns A `Promise` that resolves to `true` if the URL exists, `false` otherwise.
 */
export async function urlExists(
    url: string,
    {
        proxyUrl,
        httpClient = new GotScrapingHttpClient(),
    }: {
        proxyUrl?: string;
        httpClient?: BaseHttpClient;
    } = {},
): Promise<boolean> {
    const response = await httpClient.sendRequest({
        proxyUrl,
        url,
        method: 'HEAD',
    });

    if (response.statusCode < 200 || response.statusCode >= 400) {
        return false;
    }

    return true;
}

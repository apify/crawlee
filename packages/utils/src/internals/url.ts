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

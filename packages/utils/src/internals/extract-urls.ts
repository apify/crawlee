/**
 * Helper function used to validate URLs used when extracting URLs from a page
 */
export function tryAbsoluteURL(href: string, baseUrl: string): string | undefined {
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return undefined;
    }
}

/**
 * Extracts URLs from a given page.
 */

import { tryAbsoluteURL } from './extract-urls';

// eslint-disable-next-line @typescript-eslint/ban-types
export async function extractUrlsFromPage(page: { $$eval: Function }, selector: string = 'a', baseUrl: string = ''): Promise<string[]> {
    const urls = await page.$$eval(selector, (linkEls: HTMLLinkElement[]) => linkEls.map((link) => link.getAttribute('href')).filter(Boolean)) ?? [];
    const [base] = await page.$$eval('base', (els: HTMLLinkElement[]) => els.map((el) => el.getAttribute('href')));
    const absoluteBaseUrl = base && tryAbsoluteURL(base, baseUrl);

    if (absoluteBaseUrl) {
        baseUrl = absoluteBaseUrl;
    }

    return urls.map((href: string) => {
        // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
        const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
        if (!isHrefAbsolute && !baseUrl) {
            throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                + 'Use options.baseUrl in enqueueLinks() to automatically resolve relative URLs.');
        }

        return baseUrl
            ? tryAbsoluteURL(href, baseUrl)
            : href;
    })
        .filter((href: string | undefined) => !!href);
}

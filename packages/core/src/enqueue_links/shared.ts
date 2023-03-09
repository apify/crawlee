import { URL } from 'url';
import { purlToRegExp } from '@apify/pseudo_url';
import minimatch from 'minimatch';
import type { RequestOptions } from '../request';
import { Request } from '../request';
import type { EnqueueLinksOptions } from './enqueue_links';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `globs`/`regexps`/`pseudoUrls` output while keeping high performance,
 * all the regexps from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPatternCache = new Map();

export type UrlPatternObject = {
    glob?: string;
    regexp?: RegExp;
} & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;

export type PseudoUrlObject = { purl: string } & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;

export type PseudoUrlInput = string | PseudoUrlObject;

export type GlobObject = { glob: string } & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;

export type GlobInput = string | GlobObject;

export type RegExpObject = { regexp: RegExp } & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;

export type RegExpInput = RegExp | RegExpObject;

/**
 * @ignore
 */
export function updateEnqueueLinksPatternCache(item: GlobInput | RegExpInput | PseudoUrlInput, pattern: RegExpObject | GlobObject): void {
    enqueueLinksPatternCache.set(item, pattern);
    if (enqueueLinksPatternCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
        const key = enqueueLinksPatternCache.keys().next().value;
        enqueueLinksPatternCache.delete(key);
    }
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from PseudoUrl strings.
 * @ignore
 */
export function constructRegExpObjectsFromPseudoUrls(pseudoUrls: PseudoUrlInput[]): RegExpObject[] {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl object from cache.
        let regexpObject = enqueueLinksPatternCache.get(item);
        if (regexpObject) return regexpObject;

        if (typeof item === 'string') {
            regexpObject = { regexp: purlToRegExp(item) };
        } else {
            const { purl, ...requestOptions } = item;
            regexpObject = { regexp: purlToRegExp(purl), ...requestOptions };
        }

        updateEnqueueLinksPatternCache(item, regexpObject);

        return regexpObject;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct Glob objects from Glob pattern strings.
 * @ignore
 */
export function constructGlobObjectsFromGlobs(globs: GlobInput[]): GlobObject[] {
    return globs.map((item) => {
        // Get glob object from cache.
        let globObject = enqueueLinksPatternCache.get(item);
        if (globObject) return globObject;

        if (typeof item === 'string') {
            globObject = { glob: validateGlobPattern(item) };
        } else {
            const { glob, ...requestOptions } = item;
            globObject = { glob: validateGlobPattern(glob), ...requestOptions };
        }

        updateEnqueueLinksPatternCache(item, globObject);

        return globObject;
    });
}

/**
 * @internal
 */
export function validateGlobPattern(glob: string): string {
    const globTrimmed = glob.trim();
    if (globTrimmed.length === 0) throw new Error(`Cannot parse Glob pattern '${globTrimmed}': it must be an non-empty string`);
    return globTrimmed;
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export function constructRegExpObjectsFromRegExps(regexps: RegExpInput[]): RegExpObject[] {
    return regexps.map((item) => {
        // Get regexp object from cache.
        let regexpObject = enqueueLinksPatternCache.get(item);
        if (regexpObject) return regexpObject;

        if (item instanceof RegExp) {
            regexpObject = { regexp: item };
        } else {
            regexpObject = item;
        }

        updateEnqueueLinksPatternCache(item, regexpObject);

        return regexpObject;
    });
}

/**
 * @ignore
 */
export function createRequests(
    requestOptions: (string | RequestOptions)[],
    urlPatternObjects?: UrlPatternObject[],
    excludePatternObjects: UrlPatternObject[] = [],
): Request[] {
    if (!urlPatternObjects || !urlPatternObjects.length) {
        return requestOptions
            .map((opts) => new Request(typeof opts === 'string' ? { url: opts } : opts));
    }

    const requests: Request[] = [];

    for (const opts of requestOptions) {
        const urlToMatch = typeof opts === 'string' ? opts : opts.url;

        let isExcluded = false;
        for (const excludePatternObject of excludePatternObjects) {
            const { regexp, glob } = excludePatternObject;

            if (
                (regexp && urlToMatch.match(regexp)) || // eslint-disable-line
                (glob && minimatch(urlToMatch, glob, { nocase: true }))
            ) {
                isExcluded = true;
                break;
            }
        }

        if (isExcluded) continue;

        for (const urlPatternObject of urlPatternObjects) {
            const { regexp, glob, ...requestRegExpOptions } = urlPatternObject;
            if (
                (regexp && urlToMatch.match(regexp)) || // eslint-disable-line
                (glob && minimatch(urlToMatch, glob, { nocase: true }))
            ) {
                const request = typeof opts === 'string'
                    ? { url: opts, ...requestRegExpOptions }
                    : { ...opts, ...requestRegExpOptions };
                requests.push(new Request(request));

                // Stop checking other patterns for this request option as it was already matched
                break;
            }
        }
    }

    return requests;
}

export function filterRequestsByPatterns(requests: Request[], patterns?: UrlPatternObject[]): Request[] {
    if (!patterns?.length) {
        return requests;
    }

    const filtered: Request[] = [];

    for (const request of requests) {
        for (const urlPatternObject of patterns) {
            const { regexp, glob } = urlPatternObject;

            if (
                (regexp && request.url.match(regexp)) || // eslint-disable-line
                (glob && minimatch(request.url, glob, { nocase: true }))
            ) {
                filtered.push(request);
                // Break the pattern loop, as we already matched this request once
                break;
            }
        }
    }

    return filtered;
}

/**
 * @ignore
 */
export function createRequestOptions(
    sources: (string | Record<string, unknown>)[],
    options: Pick<EnqueueLinksOptions, 'label' | 'userData'> = {},
): RequestOptions[] {
    return sources
        .map((src) => (typeof src === 'string' ? { url: src } : src as unknown as RequestOptions))
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        })
        .map((requestOptions) => {
            requestOptions.userData ??= options.userData ?? {};
            if (typeof options.label === 'string') {
                requestOptions.userData = {
                    ...requestOptions.userData,
                    label: options.label,
                };
            }

            return requestOptions;
        });
}

/**
 * Helper function used to validate URLs used when extracting URLs from a page
 */
export function tryAbsoluteURL(href: string, baseUrl: string): string | undefined {
    try {
        return (new URL(href, baseUrl)).href;
    } catch {
        return undefined;
    }
}

/**
 * Takes an Apify {@apilink RequestOptions} object and changes its attributes in a desired way. This user-function is used
 * {@apilink enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): RequestOptions | false | undefined | null;
}

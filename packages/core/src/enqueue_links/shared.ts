import { URL } from 'node:url';

import type { Awaitable } from '@crawlee/types';
import { Minimatch } from 'minimatch';

import { purlToRegExp } from '@apify/pseudo_url';

import type { RequestOptions } from '../request';
import { Request } from '../request';
import type { EnqueueLinksOptions } from './enqueue_links';

export { tryAbsoluteURL } from '@crawlee/utils';

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

export type PseudoUrlObject = { purl: string } & Pick<
    RequestOptions,
    'method' | 'payload' | 'label' | 'userData' | 'headers'
>;

export type PseudoUrlInput = string | PseudoUrlObject;

export type GlobObject = { glob: string } & Pick<
    RequestOptions,
    'method' | 'payload' | 'label' | 'userData' | 'headers'
>;

export type GlobInput = string | GlobObject;

export type RegExpObject = { regexp: RegExp } & Pick<
    RequestOptions,
    'method' | 'payload' | 'label' | 'userData' | 'headers'
>;

export type RegExpInput = RegExp | RegExpObject;

export type SkippedRequestReason = 'robotsTxt' | 'limit' | 'enqueueLimit' | 'filters' | 'redirect' | 'depth';

export type SkippedRequestCallback = (args: { url: string; reason: SkippedRequestReason }) => Awaitable<void>;

/**
 * @ignore
 */
export function updateEnqueueLinksPatternCache(
    item: GlobInput | RegExpInput | PseudoUrlInput,
    pattern: RegExpObject | GlobObject,
): void {
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
export function constructRegExpObjectsFromPseudoUrls(pseudoUrls: readonly PseudoUrlInput[]): RegExpObject[] {
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
export function constructGlobObjectsFromGlobs(globs: readonly GlobInput[]): GlobObject[] {
    return globs
        .filter((glob) => {
            // Skip possibly nullish, empty strings
            if (!glob) {
                return false;
            }

            if (typeof glob === 'string') {
                return glob.trim().length > 0;
            }

            if (glob.glob) {
                return glob.glob.trim().length > 0;
            }

            return false;
        })
        .map((item) => {
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
    if (globTrimmed.length === 0)
        throw new Error(`Cannot parse Glob pattern '${globTrimmed}': it must be an non-empty string`);
    return globTrimmed;
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export function constructRegExpObjectsFromRegExps(regexps: readonly RegExpInput[]): RegExpObject[] {
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
    strategy?: EnqueueLinksOptions['strategy'],
    onSkippedUrl?: (url: string) => void,
): Request[] {
    const excludePatternObjectMatchers = excludePatternObjects.map(createPatternObjectMatcher);
    const urlPatternObjectMatchers = urlPatternObjects?.map(createPatternObjectMatcher);

    return requestOptions
        .map((opts) => ({ url: typeof opts === 'string' ? opts : opts.url, opts }))
        .filter(({ url }) => {
            const matchesExcludePatterns = excludePatternObjectMatchers.some(({ match }) => match(url));

            if (matchesExcludePatterns) {
                onSkippedUrl?.(url);
            }

            return !matchesExcludePatterns;
        })
        .map(({ url, opts }) => {
            if (!urlPatternObjectMatchers || !urlPatternObjectMatchers.length) {
                return new Request(typeof opts === 'string' ? { url: opts, enqueueStrategy: strategy } : { ...opts });
            }

            for (const urlPatternObject of urlPatternObjectMatchers) {
                const { match, glob, regexp, ...requestRegExpOptions } = urlPatternObject;
                if (match(url)) {
                    const request =
                        typeof opts === 'string'
                            ? { url: opts, ...requestRegExpOptions, enqueueStrategy: strategy }
                            : { ...opts, ...requestRegExpOptions, enqueueStrategy: strategy };

                    return new Request(request);
                }
            }

            // didn't match any positive pattern
            onSkippedUrl?.(url);
            return null;
        })
        .filter((request) => request) as Request[];
}

export function filterRequestsByPatterns(
    requests: Request[],
    patterns?: UrlPatternObject[],
    onSkippedUrl?: (url: string) => void,
): Request[] {
    if (!patterns?.length) {
        return requests;
    }

    const filtered: Request[] = [];
    const patternMatchers = patterns?.map(createPatternObjectMatcher);

    for (const request of requests) {
        const matchingPattern = patternMatchers.find(({ match }) => match(request.url));

        if (matchingPattern !== undefined) {
            filtered.push(request);
        } else {
            onSkippedUrl?.(request.url);
        }
    }

    return filtered;
}

/**
 * @ignore
 */
export function createRequestOptions(
    sources: (string | Record<string, unknown>)[],
    options: Pick<EnqueueLinksOptions, 'label' | 'userData' | 'baseUrl' | 'skipNavigation' | 'strategy'> = {},
): RequestOptions[] {
    return sources
        .map((src) =>
            typeof src === 'string'
                ? { url: src, enqueueStrategy: options.strategy }
                : ({ ...src, enqueueStrategy: options.strategy } as RequestOptions),
        )
        .filter(({ url }) => {
            try {
                return new URL(url, options.baseUrl).href;
            } catch (err) {
                return false;
            }
        })
        .map((requestOptions) => {
            requestOptions.url = new URL(requestOptions.url, options.baseUrl).href;
            requestOptions.userData ??= options.userData ?? {};

            if (typeof options.label === 'string') {
                requestOptions.userData = {
                    ...requestOptions.userData,
                    label: options.label,
                };
            }

            if (options.skipNavigation) {
                requestOptions.skipNavigation = true;
            }

            return requestOptions;
        });
}

/**
 * @ignore
 */
function createPatternObjectMatcher(urlPatternObject: UrlPatternObject) {
    const { regexp, glob } = urlPatternObject;
    let match;
    if (regexp) {
        match = (url: string) => regexp.test(url);
    } else if (glob) {
        const m = new Minimatch(glob, { nocase: true });
        match = (url: string) => m.match(url);
    } else {
        match = () => false;
    }
    return { ...urlPatternObject, match };
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

import { URL } from 'node:url';

import type { Awaitable } from '@crawlee/types';
import { Minimatch } from 'minimatch';

import type { RequestOptions } from '../request.js';
import type { EnqueueLinksOptions } from './enqueue_links.js';

export { tryAbsoluteURL } from '@crawlee/utils';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `include`/`exclude` output while keeping high performance,
 * all the regexps from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPatternCache = new Map();

export interface UrlPatternObject {
    glob?: string;
    regexp?: RegExp;
}

export interface GlobObject {
    glob: string;
}

export type GlobInput = string | GlobObject;

export interface RegExpObject {
    regexp: RegExp;
}

export type RegExpInput = RegExp | RegExpObject;

/** Unified URL pattern input — accepts glob strings, glob objects, RegExp instances, or regexp objects. */
export type UrlPatternInput = GlobInput | RegExpInput;

export type SkippedRequestReason =
    | 'robotsTxt'
    | 'limit'
    | 'enqueueLimit'
    | 'filters'
    | 'transform'
    | 'redirect'
    | 'depth';

export type SkippedRequestCallback = (args: { url: string; reason: SkippedRequestReason }) => Awaitable<void>;

/**
 * @ignore
 */
export function updateEnqueueLinksPatternCache(
    item: GlobInput | RegExpInput,
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
                globObject = { glob: validateGlobPattern(item.glob) };
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
            regexpObject = { regexp: item.regexp };
        }

        updateEnqueueLinksPatternCache(item, regexpObject);

        return regexpObject;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` function to construct UrlPatternObjects
 * from a mixed array of glob strings, glob objects, RegExp instances, and regexp objects.
 * @ignore
 */
export function constructUrlPatternObjects(patterns: readonly UrlPatternInput[]): UrlPatternObject[] {
    const result: UrlPatternObject[] = [];

    for (const item of patterns) {
        if (typeof item === 'string' || 'glob' in item) {
            result.push(...constructGlobObjectsFromGlobs([item]));
        } else if (item instanceof RegExp || 'regexp' in item) {
            result.push(...constructRegExpObjectsFromRegExps([item]));
        }
    }

    return result;
}

/**
 * Filters request options by URL patterns.
 *
 * When `includePatterns` is empty/undefined, all options pass through (only exclude filtering applies).
 * @ignore
 */
export function filterRequestOptionsByPatterns(
    requestOptions: RequestOptions[],
    includePatterns: UrlPatternObject[] | undefined,
    excludePatterns: UrlPatternObject[] = [],
    strategy?: EnqueueLinksOptions['strategy'],
    onSkippedUrl?: (url: string) => void,
): RequestOptions[] {
    const excludeMatchers = excludePatterns.map(createPatternObjectMatcher);
    const includeMatchers = includePatterns?.length ? includePatterns.map(createPatternObjectMatcher) : undefined;

    return requestOptions
        .filter(({ url }) => {
            const matchesExclude = excludeMatchers.some(({ match }) => match(url));
            if (matchesExclude) {
                onSkippedUrl?.(url);
            }
            return !matchesExclude;
        })
        .map((opts) => {
            if (!includeMatchers) {
                return { ...opts, enqueueStrategy: strategy };
            }

            for (const { match } of includeMatchers) {
                if (match(opts.url)) {
                    return { ...opts, enqueueStrategy: strategy };
                }
            }

            // didn't match any positive pattern
            onSkippedUrl?.(opts.url);
            return null;
        })
        .filter((opts) => opts !== null);
}

/**
 * @ignore
 */
export function createRequestOptions(
    sources: readonly (string | Record<string, unknown>)[],
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
    let match: (url: string) => boolean;
    if (regexp) {
        match = (url: string) => regexp.test(url);
    } else if (glob) {
        const m = new Minimatch(glob, { nocase: true });
        match = (url: string) => m.match(url);
    } else {
        match = () => false;
    }
    return { match };
}

/**
 * Takes a {@apilink RequestOptions} object and changes its attributes in a desired way. This user-function is used
 * by {@apilink enqueueLinks} to modify request options before they are converted to {@apilink Request} instances.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue, `'unchanged'` to keep the original options as-is,
     *   or a falsy value / `'skip'` to exclude the request from the queue.
     */
    (original: RequestOptions): RequestOptions | false | undefined | null | 'skip' | 'unchanged';
}

/**
 * Applies a {@apilink RequestTransform} function to a list of request options.
 * Options for which the transform returns a falsy value are removed from the list.
 * @param onSkipped Called with the original request options when the transform returns a falsy value (i.e. the request is skipped).
 * @ignore
 * @internal
 */
export function applyRequestTransform(
    requestOptions: RequestOptions[],
    transformFn: RequestTransform,
    onSkipped?: (requestOptions: RequestOptions) => void,
): RequestOptions[] {
    return requestOptions
        .map((opts) => {
            const transformed = transformFn(opts);
            if (transformed === 'skip') {
                onSkipped?.(opts);
                return null;
            }
            if (transformed === 'unchanged') {
                return opts;
            }
            if (!transformed) {
                onSkipped?.(opts);
                return null;
            }
            return transformed;
        })
        .filter((r): r is RequestOptions => r !== null);
}

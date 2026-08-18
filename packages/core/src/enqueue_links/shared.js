import { URL } from 'node:url';
import { Minimatch } from 'minimatch';
import { z } from 'zod';
import { schemas } from '../validators.js';
const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;
/**
 * To keep high performance when the same patterns are passed on every `enqueueLinks()` call,
 * each glob/regexp is only compiled once and then kept in a cache.
 * @ignore
 */
const enqueueLinksPatternCache = new Map();
/**
 * Accepts one {@apilink UrlPatternInput} — a glob string, a RegExp instance, or a `{ glob }` / `{ regexp }` object.
 * @internal
 */
export const urlPatternSchema = z.union([
    z.string(),
    z.instanceof(RegExp),
    schemas.objectWithKeys(['glob']),
    schemas.objectWithKeys(['regexp']),
]);
/**
 * @ignore
 */
export function updateEnqueueLinksPatternCache(item, pattern) {
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
export function constructGlobObjectsFromGlobs(globs) {
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
        if (globObject)
            return globObject;
        if (typeof item === 'string') {
            globObject = { glob: validateGlobPattern(item) };
        }
        else {
            globObject = { glob: validateGlobPattern(item.glob) };
        }
        updateEnqueueLinksPatternCache(item, globObject);
        return globObject;
    });
}
/**
 * @internal
 */
export function validateGlobPattern(glob) {
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
export function constructRegExpObjectsFromRegExps(regexps) {
    return regexps.map((item) => {
        // Get regexp object from cache.
        let regexpObject = enqueueLinksPatternCache.get(item);
        if (regexpObject)
            return regexpObject;
        if (item instanceof RegExp) {
            regexpObject = { regexp: item };
        }
        else {
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
export function constructUrlPatternObjects(patterns) {
    const result = [];
    for (const item of patterns) {
        if (typeof item === 'string' || 'glob' in item) {
            result.push(...constructGlobObjectsFromGlobs([item]));
        }
        else if (item instanceof RegExp || 'regexp' in item) {
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
export function filterRequestOptionsByPatterns(requestOptions, includePatterns, excludePatterns = [], strategy, onSkippedUrl) {
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
function isAbsoluteUrl(url) {
    try {
        // eslint-disable-next-line no-new
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * @ignore
 */
export function createRequestOptions(sources, options = {}) {
    return sources
        .map((src) => typeof src === 'string'
        ? { url: src, enqueueStrategy: options.strategy }
        : { ...src, enqueueStrategy: options.strategy })
        .filter(({ url }) => {
        try {
            return new URL(url, options.baseUrl).href;
        }
        catch (err) {
            return false;
        }
    })
        .map((requestOptions) => {
        // Leave already-absolute URLs untouched - re-deriving them via `new URL()` would normalize them
        // (e.g. adding a trailing slash to a bare domain), which is surprising for URLs that didn't need
        // resolving against `baseUrl` in the first place.
        if (!isAbsoluteUrl(requestOptions.url)) {
            requestOptions.url = new URL(requestOptions.url, options.baseUrl).href;
        }
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
        if (options.sessionId) {
            requestOptions.sessionId = options.sessionId;
        }
        return requestOptions;
    });
}
/**
 * @ignore
 */
function createPatternObjectMatcher(urlPatternObject) {
    const { regexp, glob } = urlPatternObject;
    let match;
    if (regexp) {
        match = (url) => regexp.test(url);
    }
    else if (glob) {
        const m = new Minimatch(glob, { nocase: true });
        match = (url) => m.match(url);
    }
    else {
        match = () => false;
    }
    return { match };
}
/**
 * Applies a {@apilink RequestTransform} function to a list of request options.
 * Options for which the transform returns a falsy value are removed from the list.
 * @param onSkipped Called with the original request options when the transform returns a falsy value (i.e. the request is skipped).
 * @ignore
 * @internal
 */
export function applyRequestTransform(requestOptions, transformFn, onSkipped) {
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
        .filter((r) => r !== null);
}

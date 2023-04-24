"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryAbsoluteURL = exports.createRequestOptions = exports.filterRequestsByPatterns = exports.createRequests = exports.constructRegExpObjectsFromRegExps = exports.validateGlobPattern = exports.constructGlobObjectsFromGlobs = exports.constructRegExpObjectsFromPseudoUrls = exports.updateEnqueueLinksPatternCache = void 0;
const tslib_1 = require("tslib");
const url_1 = require("url");
const pseudo_url_1 = require("@apify/pseudo_url");
const minimatch_1 = tslib_1.__importDefault(require("minimatch"));
const request_1 = require("../request");
const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;
/**
 * To enable direct use of the Actor UI `globs`/`regexps`/`pseudoUrls` output while keeping high performance,
 * all the regexps from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPatternCache = new Map();
/**
 * @ignore
 */
function updateEnqueueLinksPatternCache(item, pattern) {
    enqueueLinksPatternCache.set(item, pattern);
    if (enqueueLinksPatternCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
        const key = enqueueLinksPatternCache.keys().next().value;
        enqueueLinksPatternCache.delete(key);
    }
}
exports.updateEnqueueLinksPatternCache = updateEnqueueLinksPatternCache;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from PseudoUrl strings.
 * @ignore
 */
function constructRegExpObjectsFromPseudoUrls(pseudoUrls) {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl object from cache.
        let regexpObject = enqueueLinksPatternCache.get(item);
        if (regexpObject)
            return regexpObject;
        if (typeof item === 'string') {
            regexpObject = { regexp: (0, pseudo_url_1.purlToRegExp)(item) };
        }
        else {
            const { purl, ...requestOptions } = item;
            regexpObject = { regexp: (0, pseudo_url_1.purlToRegExp)(purl), ...requestOptions };
        }
        updateEnqueueLinksPatternCache(item, regexpObject);
        return regexpObject;
    });
}
exports.constructRegExpObjectsFromPseudoUrls = constructRegExpObjectsFromPseudoUrls;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct Glob objects from Glob pattern strings.
 * @ignore
 */
function constructGlobObjectsFromGlobs(globs) {
    return globs.map((item) => {
        // Get glob object from cache.
        let globObject = enqueueLinksPatternCache.get(item);
        if (globObject)
            return globObject;
        if (typeof item === 'string') {
            globObject = { glob: validateGlobPattern(item) };
        }
        else {
            const { glob, ...requestOptions } = item;
            globObject = { glob: validateGlobPattern(glob), ...requestOptions };
        }
        updateEnqueueLinksPatternCache(item, globObject);
        return globObject;
    });
}
exports.constructGlobObjectsFromGlobs = constructGlobObjectsFromGlobs;
/**
 * @internal
 */
function validateGlobPattern(glob) {
    const globTrimmed = glob.trim();
    if (globTrimmed.length === 0)
        throw new Error(`Cannot parse Glob pattern '${globTrimmed}': it must be an non-empty string`);
    return globTrimmed;
}
exports.validateGlobPattern = validateGlobPattern;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
function constructRegExpObjectsFromRegExps(regexps) {
    return regexps.map((item) => {
        // Get regexp object from cache.
        let regexpObject = enqueueLinksPatternCache.get(item);
        if (regexpObject)
            return regexpObject;
        if (item instanceof RegExp) {
            regexpObject = { regexp: item };
        }
        else {
            regexpObject = item;
        }
        updateEnqueueLinksPatternCache(item, regexpObject);
        return regexpObject;
    });
}
exports.constructRegExpObjectsFromRegExps = constructRegExpObjectsFromRegExps;
/**
 * @ignore
 */
function createRequests(requestOptions, urlPatternObjects, excludePatternObjects = []) {
    if (!urlPatternObjects || !urlPatternObjects.length) {
        return requestOptions
            .map((opts) => new request_1.Request(typeof opts === 'string' ? { url: opts } : opts));
    }
    const requests = [];
    for (const opts of requestOptions) {
        const urlToMatch = typeof opts === 'string' ? opts : opts.url;
        let isExcluded = false;
        for (const excludePatternObject of excludePatternObjects) {
            const { regexp, glob } = excludePatternObject;
            if ((regexp && urlToMatch.match(regexp)) || // eslint-disable-line
                (glob && (0, minimatch_1.default)(urlToMatch, glob, { nocase: true }))) {
                isExcluded = true;
                break;
            }
        }
        if (isExcluded)
            continue;
        for (const urlPatternObject of urlPatternObjects) {
            const { regexp, glob, ...requestRegExpOptions } = urlPatternObject;
            if ((regexp && urlToMatch.match(regexp)) || // eslint-disable-line
                (glob && (0, minimatch_1.default)(urlToMatch, glob, { nocase: true }))) {
                const request = typeof opts === 'string'
                    ? { url: opts, ...requestRegExpOptions }
                    : { ...opts, ...requestRegExpOptions };
                requests.push(new request_1.Request(request));
                // Stop checking other patterns for this request option as it was already matched
                break;
            }
        }
    }
    return requests;
}
exports.createRequests = createRequests;
function filterRequestsByPatterns(requests, patterns) {
    if (!patterns?.length) {
        return requests;
    }
    const filtered = [];
    for (const request of requests) {
        for (const urlPatternObject of patterns) {
            const { regexp, glob } = urlPatternObject;
            if ((regexp && request.url.match(regexp)) || // eslint-disable-line
                (glob && (0, minimatch_1.default)(request.url, glob, { nocase: true }))) {
                filtered.push(request);
                // Break the pattern loop, as we already matched this request once
                break;
            }
        }
    }
    return filtered;
}
exports.filterRequestsByPatterns = filterRequestsByPatterns;
/**
 * @ignore
 */
function createRequestOptions(sources, options = {}) {
    return sources
        .map((src) => (typeof src === 'string' ? { url: src } : src))
        .filter(({ url }) => {
        try {
            return new url_1.URL(url).href;
        }
        catch (err) {
            return false;
        }
    })
        .map((requestOptions) => {
        requestOptions.userData ?? (requestOptions.userData = options.userData ?? {});
        if (typeof options.label === 'string') {
            requestOptions.userData = {
                ...requestOptions.userData,
                label: options.label,
            };
        }
        return requestOptions;
    });
}
exports.createRequestOptions = createRequestOptions;
/**
 * Helper function used to validate URLs used when extracting URLs from a page
 */
function tryAbsoluteURL(href, baseUrl) {
    try {
        return (new url_1.URL(href, baseUrl)).href;
    }
    catch {
        return undefined;
    }
}
exports.tryAbsoluteURL = tryAbsoluteURL;
//# sourceMappingURL=shared.js.map
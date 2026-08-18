export * from './enqueue_links.js';
// Not `export *`: `UrlPatternObject` is the compiled internal form of a `UrlPatternInput` and carries no semver
// guarantees. Internal consumers import it from `./shared.js` directly.
export {
    applyRequestTransform,
    constructGlobObjectsFromGlobs,
    constructRegExpObjectsFromRegExps,
    constructUrlPatternObjects,
    createRequestOptions,
    filterRequestOptionsByPatterns,
    updateEnqueueLinksPatternCache,
    urlPatternSchema,
    validateGlobPattern,
} from './shared.js';
export type {
    GlobInput,
    GlobObject,
    RegExpInput,
    RegExpObject,
    RequestTransform,
    SkippedRequestCallback,
    SkippedRequestReason,
    UrlPatternInput,
} from './shared.js';

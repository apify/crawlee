import type { Awaitable, Dictionary } from '@crawlee/types';
import { z } from 'zod';
import type { RequestOptions } from '../request.js';
import type { EnqueueStrategyOption } from './enqueue_links.js';
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
/**
 * Accepts one {@apilink UrlPatternInput} — a glob string, a RegExp instance, or a `{ glob }` / `{ regexp }` object.
 * @internal
 */
export declare const urlPatternSchema: z.ZodType<UrlPatternInput>;
export type SkippedRequestReason = 'robotsTxt' | 'limit' | 'enqueueLimit' | 'filters' | 'transform' | 'redirect' | 'depth';
export type SkippedRequestCallback = (args: {
    url: string;
    reason: SkippedRequestReason;
}) => Awaitable<void>;
/**
 * @ignore
 */
export declare function updateEnqueueLinksPatternCache(item: GlobInput | RegExpInput, pattern: RegExpObject | GlobObject): void;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct Glob objects from Glob pattern strings.
 * @ignore
 */
export declare function constructGlobObjectsFromGlobs(globs: readonly GlobInput[]): GlobObject[];
/**
 * @internal
 */
export declare function validateGlobPattern(glob: string): string;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export declare function constructRegExpObjectsFromRegExps(regexps: readonly RegExpInput[]): RegExpObject[];
/**
 * Helper factory used in the `enqueueLinks()` function to construct UrlPatternObjects
 * from a mixed array of glob strings, glob objects, RegExp instances, and regexp objects.
 * @ignore
 */
export declare function constructUrlPatternObjects(patterns: readonly UrlPatternInput[]): UrlPatternObject[];
/**
 * Filters request options by URL patterns.
 *
 * When `includePatterns` is empty/undefined, all options pass through (only exclude filtering applies).
 * @ignore
 */
export declare function filterRequestOptionsByPatterns(requestOptions: RequestOptions[], includePatterns: UrlPatternObject[] | undefined, excludePatterns?: UrlPatternObject[], strategy?: EnqueueStrategyOption, onSkippedUrl?: (url: string) => void): RequestOptions[];
/**
 * @ignore
 */
export declare function createRequestOptions(sources: readonly (string | Record<string, unknown>)[], options?: {
    label?: string;
    userData?: Dictionary;
    baseUrl?: string;
    skipNavigation?: boolean;
    sessionId?: string;
    strategy?: EnqueueStrategyOption;
}): RequestOptions[];
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
export declare function applyRequestTransform(requestOptions: RequestOptions[], transformFn: RequestTransform, onSkipped?: (requestOptions: RequestOptions) => void): RequestOptions[];

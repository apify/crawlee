import type { Dictionary, HttpRequestOptions, ISession, ProxyInfo, SendRequestOptions } from '@crawlee/types';
import type { ReadonlyDeep } from 'type-fest';

import type { EnqueueUrlsOptions } from '../enqueue_links/enqueue_links.js';
import type { CrawleeLogger } from '../log.js';
import type { Request, RequestOptions, Source } from '../request.js';
import type { StorageIdentifier } from '../storages/storage_instance_manager.js';
import type { Dataset } from '../storages/dataset.js';
import type { KeyValueStore } from '../storages/key_value_store.js';
import type { AddRequestsBatchedResult } from '../storages/request_queue.js';

/** @internal */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * A request input (URL string, request-options object, or {@apilink Request}) whose `userData` is typed
 * according to its `label`, based on a router's route map.
 *
 * When the route map is open (the default `Record<string, ...>`), this is just the regular loose
 * {@apilink Source} input. When the map declares concrete labels, providing a `label` requires the matching
 * `userData` shape and rejects labels not present in the map; unlabeled requests keep loose `userData`.
 */
export type LabeledSource<Routes extends Record<keyof Routes, Dictionary>> = string extends keyof Routes
    ? string | Source
    :
          | string
          | Request
          | ({ requestsFromUrl?: string; regex?: RegExp } & (
                | {
                      [Label in keyof Routes & string]: Omit<Partial<RequestOptions<Routes[Label]>>, 'label'> & {
                          label: Label;
                      };
                  }[keyof Routes & string]
                | (Omit<Partial<RequestOptions>, 'label'> & { label?: undefined })
            ));

/**
 * The iterable/array of {@apilink LabeledSource} inputs accepted by the label-aware `addRequests`/`run`
 * methods of a crawler bound to a typed router.
 * @internal
 */
export type TypedRequestsLike<Routes extends Record<keyof Routes, Dictionary>> =
    | AsyncIterable<LabeledSource<Routes>>
    | Iterable<LabeledSource<Routes>>
    | LabeledSource<Routes>[];

/**
 * The label-aware `addRequests` method signature exposed on a request handler's context when the crawler is
 * bound to a typed router. Mirrors {@apilink RestrictedCrawlingContext.addRequests} with typed sources.
 */
export type TypedContextAddRequests<Routes extends Record<keyof Routes, Dictionary>> = (
    requestsLike: ReadonlyDeep<LabeledSource<Routes>[]>,
    options?: ReadonlyDeep<EnqueueUrlsOptions>,
) => Promise<AddRequestsBatchedResult>;

/**
 * An `enqueueLinks`-options object with its `label`/`userData` retyped according to a router's route map: a
 * declared `label` requires the matching `userData` shape (unknown labels are rejected), while unlabeled
 * calls keep loose `userData`. Returns the options unchanged when the route map is open (the default).
 */
type TypedEnqueueLinksOptions<Options, Routes extends Record<keyof Routes, Dictionary>> = string extends keyof Routes
    ? Options
    : Omit<Options, 'label' | 'userData'> &
          (
              | { [Label in keyof Routes & string]: { label: Label; userData?: Routes[Label] } }[keyof Routes & string]
              | { label?: undefined; userData?: Dictionary }
          );

/**
 * Transforms a context's existing `enqueueLinks` method so that the `label`/`userData` in its options follow
 * the router's route map, while preserving everything else about the signature (argument optionality and
 * return type, which differ between crawler types).
 */
export type TypedContextEnqueueLinks<
    EnqueueLinks,
    Routes extends Record<keyof Routes, Dictionary>,
> = EnqueueLinks extends (options?: infer Options) => infer Result
    ? (options?: TypedEnqueueLinksOptions<Options, Routes>) => Result
    : EnqueueLinks extends (options: infer Options) => infer Result
      ? (options: TypedEnqueueLinksOptions<Options, Routes>) => Result
      : EnqueueLinks;

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type LoadedRequest<R extends Request> = WithRequired<R, 'id' | 'loadedUrl'>;

/** @internal */
export type LoadedContext<Context extends RestrictedCrawlingContext> =
    IsAny<Context> extends true
        ? Context
        : {
              request: LoadedRequest<Context['request']>;
          } & Omit<Context, 'request'>;

export interface RestrictedCrawlingContext<UserData extends Dictionary = Dictionary> {
    id: string;
    session: ISession;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@apilink ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;

    /**
     * The original {@apilink Request} object.
     */
    request: Request<UserData>;

    /**
     * This function allows you to push data to a {@apilink Dataset} specified by name, or the one currently used by the crawler.
     *
     * Shortcut for `crawler.pushData()`.
     *
     * @param [data] Data to be pushed to the default dataset.
     */
    pushData(
        data: ReadonlyDeep<Parameters<Dataset['pushData']>[0]>,
        datasetIdentifier?: string | StorageIdentifier,
    ): Promise<void>;

    /**
     * Add requests directly to the request queue currently used by the crawler.
     *
     * Optionally, the function allows you to filter the target URLs using an array of glob or regexp patterns,
     * the same way {@apilink CrawlingContext.enqueueLinks|`enqueueLinks`} does for extracted links.
     *
     * @param requests The requests to add
     * @param options Options for the request queue
     */
    addRequests: (
        requestsLike: ReadonlyDeep<(string | Source)[]>,
        options?: ReadonlyDeep<EnqueueUrlsOptions>,
    ) => Promise<AddRequestsBatchedResult>;

    /**
     * Returns the state - a piece of mutable persistent data shared across all the request handler runs.
     */
    useState: <State extends Dictionary = Dictionary>(defaultValue?: State) => Promise<State>;

    /**
     * Get a key-value store with given name or id, or the default one for the crawler.
     */
    getKeyValueStore: (
        identifier?: string | StorageIdentifier,
    ) => Promise<Pick<KeyValueStore, 'id' | 'name' | 'getValue' | 'getAutoSavedValue' | 'setValue' | 'getPublicUrl'>>;

    /**
     * A preconfigured logger for the request handler.
     */
    log: CrawleeLogger;
}

export interface CrawlingContext<UserData extends Dictionary = Dictionary> extends RestrictedCrawlingContext<UserData> {
    /**
     * Fires HTTP request via the internal HTTP client, allowing to override the request options on the fly.
     *
     * This is handy when you work with a browser crawler but want to execute some requests outside it (e.g. API requests).
     * Check the [Skipping navigations for certain requests](https://crawlee.dev/js/docs/examples/skip-navigation) example for
     * more detailed explanation of how to do that.
     *
     * ```ts
     * async requestHandler({ sendRequest }) {
     *     const { body } = await sendRequest({
     *         // override headers only
     *         headers: { ... },
     *     });
     * },
     * ```
     */
    sendRequest: (
        requestOverrides?: Partial<HttpRequestOptions>,
        optionsOverrides?: SendRequestOptions,
    ) => Promise<Response>;

    /**
     * Register a function to be called at the very end of the request handling process. This is useful for resources that should be accessible to error handlers, for instance.
     *
     * The callback runs *outside* the request's storage transaction, so storage writes made here are
     * applied immediately and are **not** rolled back when the request fails. In
     * {@apilink AdaptivePlaywrightCrawler} it also runs once per request handler attempt, so a write
     * here can land more than once for a single request. Push results from the request handler itself.
     */
    registerDeferredCleanup(cleanup: () => Promise<unknown>): void;

    /**
     * Gives the current request `secs` more seconds to finish, for when how long it needs is only apparent
     * once it is already running - a listing page that turns out to have far more to scroll through than
     * usual, say. Prefer `requestHandlerTimeoutSecs`, or a per-route override via
     * {@apilink Router.addHandler|`router.addHandler`}, whenever the time needed is known up front.
     *
     * ```ts
     * router.addHandler('LIST', async ({ extendTimeout, page }) => {
     *     const pageCount = await countPages(page);
     *     extendTimeout(pageCount * 10);
     *     await scrapeAllPages(page);
     * });
     * ```
     *
     * Extends the request handler's own timeout and the crawler's internal one together, so the extension
     * is not immediately undone by the latter. Calling it from a handler that has already timed out does
     * nothing.
     */
    extendTimeout(secs: number): void;
}

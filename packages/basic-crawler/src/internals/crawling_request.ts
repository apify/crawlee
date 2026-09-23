import util from 'node:util';

import type { EnqueueStrategyOption } from '@crawlee/core';
import { Request } from '@crawlee/core';
import type { Dictionary, RequestSchema } from '@crawlee/types';

export type SkippedRequestReason =
    | 'robotsTxt'
    | 'limit'
    | 'enqueueLimit'
    | 'filters'
    | 'transform'
    | 'redirect'
    | 'depth';

export enum RequestState {
    UNPROCESSED,
    BEFORE_NAV,
    AFTER_NAV,
    REQUEST_HANDLER,
    DONE,
    ERROR_HANDLER,
    ERROR,
    SKIPPED,
}

export interface PushErrorMessageOptions {
    /**
     * Only push the error message without stack trace when true.
     * @default false
     */
    omitStack?: boolean;
}

/**
 * The crawler's per-request state, persisted inside `userData.__crawlee` so every storage carries it as plain user
 * data. The settings are written by the `Request` constructor from `RequestOptions`; `state` only by a running crawler.
 * @internal
 */
export interface CrawlingRequestData {
    skipNavigation?: boolean;
    crawlDepth?: number;
    sessionId?: string;
    maxRetries?: number;
    enqueueStrategy?: EnqueueStrategyOption;
    state?: RequestState;
}

/**
 * A {@apilink Request} as seen by a crawler: the same stored record, with the crawler's own per-request state
 * (`userData.__crawlee`) exposed as properties. This is what `request` is in every request handler.
 *
 * Requests fetched from a request manager are plain {@apilink Request}s; {@apilink BasicCrawler} rebuilds them
 * as `CrawlingRequest`s before handing them to the pipeline.
 * @category Sources
 */
export class CrawlingRequest<UserData extends Dictionary = Dictionary> extends Request<UserData> {
    static override fromSchema<UserData extends Dictionary = Dictionary>(
        schema: RequestSchema,
    ): CrawlingRequest<UserData> {
        return super.fromSchema(schema) as CrawlingRequest<UserData>;
    }

    private get crawleeData(): CrawlingRequestData {
        return ((this.userData as Dictionary).__crawlee ??= {});
    }

    /**
     * Tells the crawler processing this request to skip the navigation and process the request directly.
     *
     * When this is set to `true`, the crawling context will not contain the results of the navigation
     * (e.g. `response`, `body`, `contentType`, `$` or `request.loadedUrl`).
     * Accessing these properties will throw a {@apilink NavigationSkippedError} at runtime.
     */
    get skipNavigation(): boolean {
        return this.crawleeData.skipNavigation ?? false;
    }

    set skipNavigation(value: boolean) {
        this.crawleeData.skipNavigation = value;
    }

    /**
     * Depth of the request in the current crawl tree.
     * Note that this is dependent on the crawler setup and might produce unexpected results when used with multiple crawlers.
     */
    get crawlDepth(): number {
        return this.crawleeData.crawlDepth ?? 0;
    }

    set crawlDepth(value: number) {
        this.crawleeData.crawlDepth = value;
    }

    /** ID of a session to use for this request. When set, the crawler will fetch this session from the session pool instead of creating a new one. */
    get sessionId(): string | undefined {
        return this.crawleeData.sessionId;
    }

    set sessionId(value: string | undefined) {
        this.crawleeData.sessionId = value;
    }

    /** Maximum number of retries for this request. Allows to override the global `maxRequestRetries` option of `BasicCrawler`. */
    get maxRetries(): number | undefined {
        return this.crawleeData.maxRetries;
    }

    set maxRetries(value: number | undefined) {
        this.crawleeData.maxRetries = value;
    }

    /** Describes the request's current lifecycle state. */
    get state(): RequestState {
        return this.crawleeData.state ?? RequestState.UNPROCESSED;
    }

    set state(value: RequestState) {
        this.crawleeData.state = value;
    }

    /** The strategy the request was enqueued under, if it came from `enqueueLinks`. @internal */
    get enqueueStrategy(): EnqueueStrategyOption | undefined {
        return this.crawleeData.enqueueStrategy;
    }

    /**
     * Stores information about an error that occurred during processing of this request.
     *
     * You should always use Error instances when throwing errors in JavaScript.
     *
     * Nevertheless, to improve the debugging experience when using third party libraries
     * that may not always throw an Error instance, the function performs a type
     * inspection of the passed argument and attempts to extract as much information
     * as possible, since just throwing a bad type error makes any debugging rather difficult.
     *
     * @param errorOrMessage Error object or error message to be stored in the request.
     * @param [options]
     */
    pushErrorMessage(errorOrMessage: unknown, options: PushErrorMessageOptions = {}): void {
        const { omitStack } = options;
        let message;
        const type = typeof errorOrMessage;
        if (type === 'object') {
            if (!errorOrMessage) {
                message = 'null';
            } else if (errorOrMessage instanceof Error) {
                message = omitStack
                    ? errorOrMessage.message
                    : // .stack includes the message
                      errorOrMessage.stack;
            } else if (Reflect.has(Object(errorOrMessage), 'message')) {
                message = Reflect.get(Object(errorOrMessage), 'message');
            } else if ((errorOrMessage as string).toString() !== '[object Object]') {
                message = (errorOrMessage as string).toString();
            } else {
                try {
                    message = util.inspect(errorOrMessage);
                } catch (err) {
                    message = 'Unable to extract any message from the received object.';
                }
            }
        } else if (type === 'undefined') {
            message = 'undefined';
        } else {
            message = (errorOrMessage as string).toString();
        }

        this.errorMessages.push(message);
    }
}

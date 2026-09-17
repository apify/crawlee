import type { Attributes } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

import type { CrawlingContextLike, LoggerMethodDefinition } from './internal-types.js';
import type { ClassMethodToInstrument, CrawleeInstrumentationConfig } from './types.js';

export const PACKAGE_NAME = '@crawlee/otel';

/** Used when the package version cannot be determined at runtime. */
export const UNKNOWN_PACKAGE_VERSION = '0.0.0';

/**
 * Versions of the instrumented Crawlee packages this instrumentation knows how to patch. Methods that are missing
 * in the resolved version are skipped with a warning instead of breaking the module load.
 *
 * Spelled out rather than written as `^4.0.0`, because a caret range never matches a prerelease and every published
 * Crawlee v4 is one (`4.0.0-beta.x`, `4.0.0-rc.x`). The explicit `-0` bounds admit prereleases of 4.0.0 itself, and
 * `includePrerelease` on the module definitions extends that to prereleases of later v4 minors.
 *
 * `@opentelemetry/instrumentation` only consults this when the loader hands it the module's base directory, which the
 * ESM hook does not do - so today a wrong range here would not stop anything from being patched. It is still declared
 * correctly rather than left as documentation: the range is what decides whether a module is patched as soon as a base
 * directory is available, and being silently skipped is not a failure mode worth leaving armed.
 */
export const SUPPORTED_CRAWLEE_VERSIONS = ['>=4.0.0-0 <5.0.0-0'];

export const baseConfig: CrawleeInstrumentationConfig = {
    enabled: true,
    requestHandlingInstrumentation: true,
    logInstrumentation: true,
    customInstrumentation: [],
} as const;

/**
 * Extracts span attributes from a Crawlee crawling context. Uses the stable OpenTelemetry semantic conventions where
 * they exist, so that traces stay comparable with other instrumented HTTP clients.
 */
function requestAttributes(crawlingContext: CrawlingContextLike | undefined): Attributes {
    const request = crawlingContext?.request;

    // The context shape depends on the installed Crawlee version, so never assume the request is there.
    if (!request) {
        return {};
    }

    return {
        'crawlee.request.id': request.id,
        [ATTR_URL_FULL]: request.url,
        [ATTR_HTTP_REQUEST_METHOD]: request.method,
        'crawlee.request.retry_count': request.retryCount,
    };
}

export const requestHandlingInstrumentationMethods: ClassMethodToInstrument[] = [
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'run',
        spanName: 'crawlee.crawler.run',
        spanOptions() {
            return {
                attributes: {
                    'crawlee.crawler.type': this.constructor.name,
                },
            };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'handleRequest',
        spanName: 'crawlee.crawler.handleRequest',
        // `handleRequest(crawlingContext, requestSource, request)`
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'runRequestHandler',
        spanName: 'crawlee.crawler.runRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        // `AdaptivePlaywrightCrawler` replaces `runRequestHandler` outright instead of calling `super`, so the
        // `BasicCrawler` patch above never fires for it. `BrowserCrawler` does call `super`, which is why it needs
        // no entry of its own.
        moduleName: '@crawlee/playwright',
        className: 'AdaptivePlaywrightCrawler',
        methodName: 'runRequestHandler',
        spanName: 'crawlee.crawler.runRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'requestFunctionErrorHandler',
        spanName: 'crawlee.crawler.requestFunctionErrorHandler',
        // `requestFunctionErrorHandler(error, crawlingContext, request, source)`
        spanOptions(_error: Error, crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'handleFailedRequestHandler',
        spanName: 'crawlee.crawler.handleFailedRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: 'makeHttpRequest',
        spanName: 'crawlee.http.makeHttpRequest',
        spanOptions(crawlingContext: CrawlingContextLike) {
            // An outbound HTTP call, so a client span rather than the default internal one.
            return { kind: SpanKind.CLIENT, attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/browser',
        className: 'BrowserCrawler',
        methodName: 'navigate',
        spanName: 'crawlee.browser.navigate',
        spanOptions(crawlingContext: CrawlingContextLike) {
            // The browser navigation is the outbound call here.
            return { kind: SpanKind.CLIENT, attributes: requestAttributes(crawlingContext) };
        },
    },
] as const;

/**
 * Maps Apify log levels to OpenTelemetry severity numbers.
 * See https://github.com/apify/apify-shared-js/blob/83d46cf72a338ff671f89dcbc2b0db7dd571e29f/packages/log/src/log_consts.ts#L1
 *
 * ```typescript
 * export enum LogLevel {
 *      // Turns off logging completely
 *      OFF = 0,
 *      // For unexpected errors in Apify system
 *      ERROR = 1 = SeverityNumber.ERROR,
 *      // For situations where error is caused by user (e.g. Meteor.Error), i.e. when the error is not
 *      // caused by Apify system, avoid the word "ERROR" to simplify searching in log
 *      SOFT_FAIL = 2 = SeverityNumber.WARN,
 *      WARNING = 3 = SeverityNumber.WARN,
 *      INFO = 4 = SeverityNumber.INFO,
 *      DEBUG = 5 = SeverityNumber.DEBUG,
 *      // for performance stats
 *      PERF = 6 = SeverityNumber.DEBUG,
 * }
 * ```
 */
export const apifyLogLevelMap: Record<number, SeverityNumber> = {
    1: SeverityNumber.ERROR,
    2: SeverityNumber.WARN,
    3: SeverityNumber.WARN,
    4: SeverityNumber.INFO,
    5: SeverityNumber.DEBUG,
    6: SeverityNumber.DEBUG,
} as const;

/** Human readable Apify log level names, emitted as the `severityText` of the forwarded log records. */
export const apifyLogLevelNameMap: Record<number, string> = {
    1: 'ERROR',
    2: 'SOFT_FAIL',
    3: 'WARNING',
    4: 'INFO',
    5: 'DEBUG',
    6: 'PERF',
} as const;

/**
 * The logging methods to instrument, with the level each logs at.
 *
 * These live on `BaseCrawleeLogger.prototype`, which every Crawlee logger derives from, so patching them forwards logs
 * from any logger implementation - the default Apify one as well as a Winston, Pino or hand-written adapter. Each of
 * them dispatches straight to the abstract `logWithLevel`, which the adapter implements, so a call is only seen once.
 * `warningOnce` and `deprecated` are covered through `warning`.
 */
export const loggerMethods: LoggerMethodDefinition[] = [
    { methodName: 'error', level: 1, read: (args) => readMessageAndData(args) },
    {
        methodName: 'exception',
        level: 1,
        // `exception(exception, message, data)` - the error comes first.
        read: (args) => ({
            message: String(args[1] ?? ''),
            data: { ...(args[2] as Record<string, unknown> | undefined), exception: args[0] },
        }),
    },
    { methodName: 'softFail', level: 2, read: (args) => readMessageAndData(args) },
    { methodName: 'warning', level: 3, read: (args) => readMessageAndData(args) },
    { methodName: 'info', level: 4, read: (args) => readMessageAndData(args) },
    { methodName: 'debug', level: 5, read: (args) => readMessageAndData(args) },
    { methodName: 'perf', level: 6, read: (args) => readMessageAndData(args) },
];

/** The shape shared by every logging method except `exception`: `(message, data?)`. */
function readMessageAndData(args: unknown[]) {
    return {
        message: String(args[0] ?? ''),
        data: args[1] as Record<string, unknown> | undefined,
    };
}

import type { Attributes } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { ATTR_HTTP_REQUEST_METHOD, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

import type { CrawlingContextLike } from './internal-types';
import type { ClassMethodToInstrument, CrawleeInstrumentationConfig } from './types';

export const PACKAGE_NAME = '@crawlee/otel';

/** Used when the package version cannot be determined at runtime. */
export const UNKNOWN_PACKAGE_VERSION = '0.0.0';

/**
 * Versions of the instrumented Crawlee packages this instrumentation knows how to patch. Methods that are missing
 * in the resolved version are skipped with a warning instead of breaking the module load.
 */
export const SUPPORTED_CRAWLEE_VERSIONS = ['^3.0.0'];

/** Versions of `@apify/log` this instrumentation knows how to patch. Kept in sync with what Crawlee depends on. */
export const SUPPORTED_APIFY_LOG_VERSIONS = ['^2.4.0'];

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
                    'crawlee.crawler.type': this.constructor.name, // crawler context propagated from the wrapWithSpan function
                },
            };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: '_runTaskFunction',
        spanName: 'crawlee.crawler.runTaskFunction',
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: '_requestFunctionErrorHandler',
        spanName: 'crawlee.crawler.requestFunctionErrorHandler',
        // `_requestFunctionErrorHandler(error, crawlingContext, source)`
        spanOptions(_error: Error, crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: '_handleFailedRequestHandler',
        spanName: 'crawlee.crawler.handleFailedRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: '_executeHooks',
        spanName: 'crawlee.crawler.executeHooks',
    },
    {
        moduleName: '@crawlee/browser',
        className: 'BrowserCrawler',
        methodName: '_handleNavigation',
        spanName: 'crawlee.browser.handleNavigation',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/browser',
        className: 'BrowserCrawler',
        methodName: '_runRequestHandler',
        spanName: 'crawlee.browser.runRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: '_handleNavigation',
        spanName: 'crawlee.http.handleNavigation',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
        },
    },
    {
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: '_runRequestHandler',
        spanName: 'crawlee.http.runRequestHandler',
        spanOptions(crawlingContext: CrawlingContextLike) {
            return { attributes: requestAttributes(crawlingContext) };
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

import { SeverityNumber } from '@opentelemetry/api-logs';

import type { ClassMethodToInstrument, CrawleeInstrumentationConfig } from './types';

export const baseConfig: CrawleeInstrumentationConfig = {
    enabled: true,
    requestHandlingInstrumentation: true,
    logInstrumentation: true,
    customInstrumentation: [],
} as const;

export const requestHandlingInstrumentationMethods: ClassMethodToInstrument[] = [
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'run',
        spanName: 'crawlee.crawler.run',
        spanOptions() {
            return {
                attributes: {
                    'crawlee.crawler.type': this.constructor.name, // crawler context propogated from the wrapWithSpan function
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
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: '_handleFailedRequestHandler',
        spanName: 'crawlee.crawler.handleFailedRequestHandler',
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
    },
    {
        moduleName: '@crawlee/browser',
        className: 'BrowserCrawler',
        methodName: '_runRequestHandler',
        spanName: 'crawlee.browser.runRequestHandler',
        spanOptions(context: any) {
            // Request context from BrowserCrawler
            return {
                attributes: {
                    'crawlee.request.id': context.request.id,
                    'crawlee.request.url': context.request.url,
                    'crawlee.request.method': context.request.method,
                    'crawlee.request.retry_count': context.request.retryCount,
                },
            };
        },
    },
    {
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: '_handleNavigation',
        spanName: 'crawlee.http.handleNavigation',
    },
    {
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: '_runRequestHandler',
        spanName: 'crawlee.http.runRequestHandler',
        spanOptions(context: any) {
            // Request context from HttpCrawler
            return {
                attributes: {
                    'crawlee.request.id': context.request.id,
                    'crawlee.request.url': context.request.url,
                    'crawlee.request.method': context.request.method,
                    'crawlee.request.retry_count': context.request.retryCount,
                },
            };
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
 *      SOFT_FAIL = 2 = SeverityNumber.ERROR,
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

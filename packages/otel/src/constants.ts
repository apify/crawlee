import { type Exception } from "@opentelemetry/api";

import type { CrawleeInstrumentation } from "./instrumentation";
import type { ClassMethodToInstrument, CrawleeInstrumentationConfig } from "./types";

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
        spanOptions: (self: any) => ({attributes: {
            'crawlee.crawler.type': self.constructor.name,
        }}),
        // theres no easy way to hook into the requestHandler method as it is passed into the constructor
        // we cannot patch the constructor itself due to ESM restrictions so we need to wrap the method between creation and the crawler being run
        onInvokeHook: (self: any, _args: unknown[], instrumentation: CrawleeInstrumentation) => {
            const WRAPPED = Symbol.for('crawlee.requestHandler.wrapped');
            const originalRequestHandler = self.requestHandler;
            if (!self[WRAPPED]) {
                self.requestHandler = function(this: any, ...requestHandlerArgs: unknown[]) {
                    return instrumentation.getTracer().startActiveSpan('crawlee.crawler.requestHandler', async (span) => {
                    try {
                        return await originalRequestHandler.call(this, ...requestHandlerArgs);
                    } catch (err) {
                        span.recordException(err as Exception);
                        throw err;
                    } finally {
                        span.end();
                    }
                    });
                };
            }
            Object.defineProperty(self, WRAPPED, {
                value: true,
                enumerable: false,
            });
        },
    },
    {
        moduleName: '@crawlee/basic',
        className: 'BasicCrawler',
        methodName: 'stop',
        spanName: 'crawlee.crawler.stop',
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
        moduleName: '@crawlee/http',
        className: 'HttpCrawler',
        methodName: '_handleNavigation',
        spanName: 'crawlee.http.handleNavigation',
    },
] as const;
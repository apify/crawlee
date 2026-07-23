import type { CrawlingContext, ErrorHandler, RequestHandler } from '@crawlee/basic';
import type { BrowserCrawlerOptions, BrowserCrawlingContext } from '@crawlee/browser';
import type { CheerioCrawlerOptions, CheerioErrorHandler, CheerioRequestHandler } from '@crawlee/cheerio';
import type { HttpCrawlerOptions, HttpCrawlingContext, HttpErrorHandler } from '@crawlee/http';
import type { PlaywrightCrawlerOptions, PlaywrightCrawlingContext } from '@crawlee/playwright';
import type { Dictionary } from '@crawlee/utils';

/**
 * Type-level regression test for https://github.com/apify/crawlee/issues/3424.
 */
describe('ErrorHandler option types (#3424)', () => {
    test('cheerio - explicitly typed handlers via CheerioErrorHandler', () => {
        const requestHandler: CheerioRequestHandler = async ({ request }) => void request.url;
        const failedRequestHandler: CheerioErrorHandler = async ({ request }, error) => void [request, error];

        const options: CheerioCrawlerOptions = {
            requestHandler,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };

        expect(options).toBeTruthy();
    });

    test('cheerio - handler carrying an extendContext extension stays assignable', () => {
        // The idiomatic pattern: define extendContext as a named function and derive everything from it.
        const extendContext = async () => ({
            customHelper: async () => {},
        });
        type Extension = Awaited<ReturnType<typeof extendContext>>;

        // The concrete context AND the inferred extendContext additions are visible in the handler...
        const failedRequestHandler: CheerioErrorHandler<Dictionary, Dictionary, Extension> = async (context, error) => {
            await context.customHelper?.();
            void [context.request, error];
        };

        // ...and it remains assignable to a crawler configured with that extendContext.
        const options: CheerioCrawlerOptions<Extension> = {
            extendContext,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };

        expect(options).toBeTruthy();
    });

    test('http - explicitly typed handlers via HttpErrorHandler', () => {
        const failedRequestHandler: HttpErrorHandler = async ({ request }, error) => void [request, error];

        const options: HttpCrawlerOptions<HttpCrawlingContext> = {
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };

        expect(options).toBeTruthy();
    });

    test('browser - explicitly typed handlers via ErrorHandler<PlaywrightCrawlingContext>', () => {
        const requestHandler: RequestHandler<PlaywrightCrawlingContext> = async ({ request }) => void request.url;
        const failedRequestHandler: ErrorHandler<CrawlingContext, PlaywrightCrawlingContext> = async (
            { request },
            error,
        ) => void [request, error];

        const options: PlaywrightCrawlerOptions = {
            requestHandler,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };

        expect(options).toBeTruthy();
    });

    test('browser - explicitly typed handlers via ErrorHandler<BrowserCrawlingContext>', () => {
        const failedRequestHandler: ErrorHandler<CrawlingContext, BrowserCrawlingContext> = async (
            { request },
            error,
        ) => void [request, error];

        const options: BrowserCrawlerOptions = {
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };

        expect(options).toBeTruthy();
    });
});

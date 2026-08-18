/**
 * Type-level regression test for https://github.com/apify/crawlee/issues/3424.
 */
describe('ErrorHandler option types (#3424)', () => {
    test('cheerio - explicitly typed handlers via CheerioErrorHandler', () => {
        const requestHandler = async ({ request }) => void request.url;
        const failedRequestHandler = async ({ request }, error) => void [request, error];
        const options = {
            requestHandler,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };
        expect(options).toBeTruthy();
    });
    test('cheerio - handler carrying an extendContext extension stays assignable', () => {
        // The idiomatic pattern: define extendContext as a named function and derive everything from it.
        const extendContext = async () => ({
            customHelper: async () => { },
        });
        // The concrete context AND the inferred extendContext additions are visible in the handler...
        const failedRequestHandler = async (context, error) => {
            await context.customHelper?.();
            void [context.request, error];
        };
        // ...and it remains assignable to a crawler configured with that extendContext.
        const options = {
            extendContext,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };
        expect(options).toBeTruthy();
    });
    test('http - explicitly typed handlers via HttpErrorHandler', () => {
        const failedRequestHandler = async ({ request }, error) => void [request, error];
        const options = {
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };
        expect(options).toBeTruthy();
    });
    test('browser - explicitly typed handlers via ErrorHandler<PlaywrightCrawlingContext>', () => {
        const requestHandler = async ({ request }) => void request.url;
        const failedRequestHandler = async ({ request }, error) => void [request, error];
        const options = {
            requestHandler,
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };
        expect(options).toBeTruthy();
    });
    test('browser - explicitly typed handlers via ErrorHandler<BrowserCrawlingContext>', () => {
        const failedRequestHandler = async ({ request }, error) => void [request, error];
        const options = {
            errorHandler: failedRequestHandler,
            failedRequestHandler,
        };
        expect(options).toBeTruthy();
    });
});
export {};

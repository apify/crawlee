import { wrapWithSpan } from '@crawlee/otel';
import { context, trace } from '@opentelemetry/api';
import { ATTR_EXCEPTION_MESSAGE, ATTR_HTTP_REQUEST_METHOD, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';
import type { CheerioCrawlingContext, CrawlingContext } from 'crawlee';
import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 10,

    // Wrap the request handler with a custom span
    requestHandler: wrapWithSpan(
        async ({ request, $, enqueueLinks, log }: CheerioCrawlingContext) => {
            // Access the current span to add custom attributes
            const span = trace.getSpan(context.active());

            const title = $('title').text();
            const headings = $('h1, h2').length;
            const links = $('a').length;

            if (span) {
                span.setAttribute('page.title', title);
                span.setAttribute('page.headings_count', headings);
                span.setAttribute('page.links_count', links);
            }

            log.info(`Scraped page`, { url: request.url, title });

            await enqueueLinks({
                include: ['https://crawlee.dev/**'],
            });
        },
        {
            // Dynamic span name based on the request
            spanName: ({ request }: CheerioCrawlingContext) => `scrape ${request.url}`,
            // Add attributes to the span
            spanOptions: ({ request }: CheerioCrawlingContext) => ({
                attributes: {
                    [ATTR_URL_FULL]: request.url,
                    [ATTR_HTTP_REQUEST_METHOD]: request.method,
                },
            }),
        },
    ),

    // Wrap hooks with spans
    preNavigationHooks: [
        wrapWithSpan(
            ({ log }: CheerioCrawlingContext) => {
                log.debug('Pre-navigation hook executed');
            },
            {
                spanName: 'pre-navigation-hook',
            },
        ),
    ],

    // Wrap error handlers
    errorHandler: wrapWithSpan(
        ({ request, log }: CrawlingContext, error: Error) => {
            log.error(`Request failed: ${request.url}`, {
                error: error.message,
            });
        },
        {
            spanName: ({ request }: CrawlingContext) => `error-handler ${request.url}`,
            spanOptions: ({ request }: CrawlingContext, error: Error) => ({
                attributes: {
                    [ATTR_URL_FULL]: request.url,
                    [ATTR_EXCEPTION_MESSAGE]: error.message,
                },
            }),
        },
    ),

    failedRequestHandler: wrapWithSpan(
        ({ request, log }: CrawlingContext, error: Error) => {
            log.error(`Request permanently failed: ${request.url}`, {
                error: error.message,
            });
        },
        {
            spanName: 'failed-request-handler',
        },
    ),
});

await crawler.run(['https://crawlee.dev']);

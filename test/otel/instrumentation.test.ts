import type { Server } from 'node:http';

import * as basicModule from '@crawlee/basic';
import { CheerioCrawler } from '@crawlee/cheerio';
import { MemoryStorageBackend, serviceLocator } from '@crawlee/core';
import * as httpModule from '@crawlee/http';
import { CrawleeInstrumentation } from '@crawlee/otel';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_CODE_FUNCTION_NAME, ATTR_HTTP_REQUEST_METHOD, ATTR_URL_FULL } from '@opentelemetry/semantic-conventions';

import log from '@apify/log';

import { runExampleComServer } from '../shared/_helper.js';

/**
 * Drives a real crawler through the real instrumented Crawlee classes.
 *
 * The module patches are applied directly rather than through Node's module hook, which would otherwise have to be
 * registered before Vitest loads any Crawlee module. Only the delivery of the patch is bypassed - everything the
 * instrumentation itself does (which prototypes get wrapped, the span tree, the attributes, error handling, context
 * propagation across the crawler's async boundaries) is exercised here. The hook path is covered by running the
 * guide's own examples; see docs/guides/trace-and-monitor-crawlers.mdx.
 */
interface PatchableModuleDefinition {
    name: string;
    patch: (moduleExports: unknown) => unknown;
    unpatch: (moduleExports: unknown) => unknown;
}

function moduleDefinition(instrumentation: CrawleeInstrumentation, moduleName: string): PatchableModuleDefinition {
    const definitions = (instrumentation as any).init() as PatchableModuleDefinition[];
    const definition = definitions.find((d) => d.name === moduleName);

    if (!definition) {
        throw new Error(`No instrumentation definition for ${moduleName}`);
    }

    return definition;
}

describe('CrawleeInstrumentation against a real crawler', () => {
    let server: Server;
    let serverAddress: string;
    let logLevel: number;

    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;
    let patched: { definition: PatchableModuleDefinition; moduleExports: unknown }[];

    beforeAll(async () => {
        logLevel = log.getLevel();
        // Two of these tests fail requests on purpose; silence the crawler's own error reporting.
        log.setLevel(log.LEVELS.OFF);

        const [startedServer, port] = await runExampleComServer();
        server = startedServer;
        serverAddress = `http://localhost:${port}`;

        exporter = new InMemorySpanExporter();
        provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
        provider.register();

        const instrumentation = new CrawleeInstrumentation({ logInstrumentation: false });
        instrumentation.setTracerProvider(provider);
        patched = [
            { definition: moduleDefinition(instrumentation, '@crawlee/basic'), moduleExports: basicModule },
            { definition: moduleDefinition(instrumentation, '@crawlee/http'), moduleExports: httpModule },
        ];

        for (const { definition, moduleExports } of patched) {
            definition.patch(moduleExports);
        }
    });

    afterAll(async () => {
        for (const { definition, moduleExports } of patched) {
            definition.unpatch(moduleExports);
        }

        await provider.shutdown();
        server.close();
        log.setLevel(logLevel);
    });

    beforeEach(() => {
        exporter.reset();
        serviceLocator.setStorageBackend(new MemoryStorageBackend());
    });

    const byName = (spans: ReadableSpan[], name: string) => spans.filter((s) => s.name === name);
    const one = (spans: ReadableSpan[], name: string) => {
        const found = byName(spans, name);
        expect(found, `expected exactly one ${name} span, got ${found.length}`).toHaveLength(1);
        return found[0];
    };

    test('produces a nested span tree for a successful request', async () => {
        let seenUrl: string | undefined;

        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 1,
            async requestHandler({ $, request }) {
                expect($('title').text()).toBe('Example Domain');
                seenUrl = request.url;
            },
        });

        await crawler.run([serverAddress]);

        const spans = exporter.getFinishedSpans();

        expect(spans.length).toBeGreaterThan(0);
        expect(new Set(spans.map((s) => (s.instrumentationScope ?? (s as any).instrumentationLibrary)?.name))).toEqual(
            new Set(['@crawlee/otel']),
        );

        const run = one(spans, 'crawlee.crawler.run');
        const handleRequest = one(spans, 'crawlee.crawler.handleRequest');
        const requestHandler = one(spans, 'crawlee.crawler.runRequestHandler');
        const httpRequest = one(spans, 'crawlee.http.makeHttpRequest');

        // A single trace, correctly nested - this only holds if the context survives the crawler's async boundaries.
        expect(new Set(spans.map((s) => s.spanContext().traceId)).size).toBe(1);
        expect(handleRequest.parentSpanContext?.spanId).toBe(run.spanContext().spanId);
        expect(requestHandler.parentSpanContext?.spanId).toBe(handleRequest.spanContext().spanId);

        // Nothing failed, so the instrumentation leaves the status unset.
        expect(requestHandler.status.code).toBe(0);

        expect(run.attributes['crawlee.crawler.type']).toBe('CheerioCrawler');
        expect(seenUrl).toBeDefined();
        expect(requestHandler.attributes).toMatchObject({
            [ATTR_URL_FULL]: seenUrl,
            [ATTR_HTTP_REQUEST_METHOD]: 'GET',
            [ATTR_CODE_FUNCTION_NAME]: 'BasicCrawler.runRequestHandler',
            'crawlee.request.retry_count': 0,
        });
        expect(requestHandler.attributes['crawlee.request.id']).toEqual(expect.any(String));
        expect(httpRequest.attributes[ATTR_URL_FULL]).toBe(seenUrl);
    });

    test('records the failure on the request handler span and on the error handlers', async () => {
        let seenUrl: string | undefined;

        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 1,
            maxRequestRetries: 0,
            requestHandler({ request }) {
                seenUrl = request.url;
                throw new Error('handler exploded');
            },
        });

        await crawler.run([serverAddress]);

        const spans = exporter.getFinishedSpans();

        const requestHandler = one(spans, 'crawlee.crawler.runRequestHandler');
        expect(requestHandler.status.code).toBe(2); // SpanStatusCode.ERROR
        expect(requestHandler.status.message).toBe('handler exploded');
        expect(requestHandler.events.map((e) => e.name)).toContain('exception');

        // Both error handling methods are instrumented, and both report which request failed.
        const errorHandler = one(spans, 'crawlee.crawler.requestFunctionErrorHandler');
        const failedHandler = one(spans, 'crawlee.crawler.handleFailedRequestHandler');
        expect(seenUrl).toBeDefined();
        expect(errorHandler.attributes[ATTR_URL_FULL]).toBe(seenUrl);
        expect(failedHandler.attributes[ATTR_URL_FULL]).toBe(seenUrl);

        expect(requestHandler.spanContext().traceId).toBe(errorHandler.spanContext().traceId);
    });

    test('increments the retry count attribute across attempts', async () => {
        const crawler = new CheerioCrawler({
            maxRequestsPerCrawl: 1,
            maxRequestRetries: 1,
            requestHandler() {
                throw new Error('always fails');
            },
        });

        await crawler.run([serverAddress]);

        const retryCounts = byName(exporter.getFinishedSpans(), 'crawlee.crawler.runRequestHandler')
            .map((s) => s.attributes['crawlee.request.retry_count'])
            .sort();

        expect(retryCounts).toEqual([0, 1]);
    });
});

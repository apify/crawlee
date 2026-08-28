import { BasicCrawler } from '@crawlee/basic';
import * as coreModule from '@crawlee/core';
import { CrawleeInstrumentation } from '@crawlee/otel';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { ATTR_EXCEPTION_MESSAGE, ATTR_EXCEPTION_TYPE } from '@opentelemetry/semantic-conventions';

/**
 * Forwards logs from the real `@crawlee/core` logger, patched the same way the module hook would patch it.
 *
 * The patch targets `BaseCrawleeLogger`, which every Crawlee logger derives from, so this also covers a Winston, Pino
 * or hand-written adapter - only `logWithLevel` differs between them.
 */
describe('log forwarding against the real Crawlee logger', () => {
    let exporter: InMemoryLogRecordExporter;
    let loggerProvider: LoggerProvider;
    let definition: { patch: (e: unknown) => unknown; unpatch: (e: unknown) => unknown };

    beforeAll(() => {
        exporter = new InMemoryLogRecordExporter();
        loggerProvider = new LoggerProvider({ processors: [new SimpleLogRecordProcessor(exporter)] });

        const instrumentation = new CrawleeInstrumentation({ requestHandlingInstrumentation: false });
        instrumentation.setLoggerProvider(loggerProvider);

        definition = (instrumentation as any).init().find((d: any) => d.name === '@crawlee/core');
        definition.patch(coreModule);
    });

    afterAll(async () => {
        definition.unpatch(coreModule);
        await loggerProvider.shutdown();
    });

    beforeEach(() => exporter.reset());

    test('forwards a log made through the default Crawlee logger', () => {
        const log = new coreModule.ApifyLogAdapter(coreModule.log);

        log.info('hello from crawlee', { page: 3 });

        const records = exporter.getFinishedLogRecords();
        expect(records).toHaveLength(1);
        expect(records[0].body).toBe('hello from crawlee');
        expect(records[0].severityNumber).toBe(SeverityNumber.INFO);
        expect(records[0].severityText).toBe('INFO');
        expect(records[0].attributes).toMatchObject({ page: 3 });
    });

    test('records an exception on the semantic convention attributes', () => {
        const log = new coreModule.ApifyLogAdapter(coreModule.log);

        log.exception(new RangeError('out of range'), 'request failed');

        const record = exporter.getFinishedLogRecords()[0];
        expect(record.severityNumber).toBe(SeverityNumber.ERROR);
        expect(record.attributes[ATTR_EXCEPTION_TYPE]).toBe('RangeError');
        expect(record.attributes[ATTR_EXCEPTION_MESSAGE]).toBe('out of range');
    });

    test('forwards a crawler status message', () => {
        coreModule.serviceLocator.setStorageBackend(new coreModule.MemoryStorageBackend());
        const crawler = new BasicCrawler({ requestHandler: async () => {} });
        exporter.reset();

        crawler.setStatusMessage('Crawled 40/100 pages, 2 failed.', { level: 'INFO' });

        // `setStatusMessage` is the one place in Crawlee that logs at a level chosen at runtime. It used to reach for
        // `logWithLevel`, which is abstract on `BaseCrawleeLogger` and so cannot be patched - the periodic status
        // messages never reached OpenTelemetry at all.
        const record = exporter.getFinishedLogRecords().at(-1)!;
        expect(record.body).toBe('Crawled 40/100 pages, 2 failed.');
        expect(record.severityNumber).toBe(SeverityNumber.INFO);
    });

    test('maps each level onto the matching severity', () => {
        const log = new coreModule.ApifyLogAdapter(coreModule.log);

        log.error('e');
        log.softFail('s');
        log.warning('w');
        log.debug('d');
        log.perf('p');

        expect(exporter.getFinishedLogRecords().map((r) => r.severityNumber)).toEqual([
            SeverityNumber.ERROR,
            SeverityNumber.WARN,
            SeverityNumber.WARN,
            SeverityNumber.DEBUG,
            SeverityNumber.DEBUG,
        ]);
    });
});

import { CheerioCrawler, BaseCrawleeLogger, LogLevel } from 'crawlee';
import type { CrawleeLogger, CrawleeLoggerOptions } from 'crawlee';
import pino from 'pino';

// Map Crawlee log levels to Pino levels
const CRAWLEE_TO_PINO: Record<number, string> = {
    [LogLevel.ERROR]: 'error',
    [LogLevel.SOFT_FAIL]: 'warn',
    [LogLevel.WARNING]: 'warn',
    [LogLevel.INFO]: 'info',
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.PERF]: 'trace',
};

class PinoAdapter extends BaseCrawleeLogger {
    constructor(
        private logger: pino.Logger,
        options?: Partial<CrawleeLoggerOptions>,
    ) {
        super(options);
    }

    logWithLevel(level: number, message: string, data?: Record<string, unknown>): void {
        const pinoLevel = CRAWLEE_TO_PINO[level] ?? 'info';
        this.logger[pinoLevel as pino.Level](data ?? {}, message);
    }

    protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new PinoAdapter(this.logger.child({ prefix: options.prefix }), { ...this.getOptions(), ...options });
    }
}

// Create a Pino logger with your preferred configuration
const pinoLogger = pino({
    level: 'debug',
});

// Pass the adapter to the crawler via the `logger` option
const crawler = new CheerioCrawler({
    logger: new PinoAdapter(pinoLogger),
    async requestHandler({ request, $, log }) {
        log.info(`Processing ${request.url}`);
        const title = $('title').text();
        log.debug('Page title extracted', { title });
    },
});

await crawler.run(['https://crawlee.dev']);

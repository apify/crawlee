import { CheerioCrawler, BaseCrawleeLogger, LogLevel } from 'crawlee';
import winston from 'winston';
// Map Crawlee log levels to Winston levels
const CRAWLEE_TO_WINSTON = {
    [LogLevel.ERROR]: 'error',
    [LogLevel.SOFT_FAIL]: 'warn',
    [LogLevel.WARNING]: 'warn',
    [LogLevel.INFO]: 'info',
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.PERF]: 'debug',
};
class WinstonAdapter extends BaseCrawleeLogger {
    logger;
    constructor(logger, options) {
        super(options);
        this.logger = logger;
    }
    logWithLevel(level, message, data) {
        const winstonLevel = CRAWLEE_TO_WINSTON[level] ?? 'info';
        this.logger.log(winstonLevel, message, data);
    }
    createChild(options) {
        return new WinstonAdapter(this.logger.child({ prefix: options.prefix }), { ...this.getOptions(), ...options });
    }
}
// Create a Winston logger with your preferred configuration
const winstonLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(winston.format.colorize(), winston.format.timestamp(), winston.format.printf(({ level, message, timestamp, prefix }) => {
        const tag = prefix ? `[${prefix}] ` : '';
        return `${timestamp} ${level}: ${tag}${message}`;
    })),
    transports: [new winston.transports.Console()],
});
// Pass the adapter to the crawler via the `logger` option
const crawler = new CheerioCrawler({
    logger: new WinstonAdapter(winstonLogger),
    async requestHandler({ request, $, log }) {
        log.info(`Processing ${request.url}`);
        const title = $('title').text();
        log.debug('Page title extracted', { title });
    },
});
await crawler.run(['https://crawlee.dev']);

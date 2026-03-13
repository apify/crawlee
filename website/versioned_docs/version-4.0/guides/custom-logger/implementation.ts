import winston from 'winston';
import { BaseCrawleeLogger } from 'crawlee';
import type { CrawleeLogger, CrawleeLoggerOptions } from 'crawlee';

// Map Crawlee numeric log levels to Winston level strings
// LogLevel values: ERROR=1, SOFT_FAIL=2, WARNING=3, INFO=4, PERF=5, DEBUG=6
const CRAWLEE_LEVEL_TO_WINSTON: Record<number, string> = {
    1: 'error',   // ERROR
    2: 'warn',    // SOFT_FAIL
    3: 'warn',    // WARNING
    4: 'info',    // INFO
    5: 'debug',   // PERF
    6: 'debug',   // DEBUG
};

/**
 * Adapter that bridges Crawlee's CrawleeLogger interface to a Winston logger.
 * Extend BaseCrawleeLogger and implement only `logWithLevel()` and `createChild()`.
 */
export class WinstonAdapter extends BaseCrawleeLogger {
    constructor(
        private readonly logger: winston.Logger,
        options?: Partial<CrawleeLoggerOptions>,
    ) {
        super(options);
    }

    logWithLevel(level: number, message: string, data?: Record<string, unknown>): void {
        const winstonLevel = CRAWLEE_LEVEL_TO_WINSTON[level] ?? 'info';
        const prefix = this.getOptions().prefix;
        this.logger.log(winstonLevel, message, { ...data, prefix });
    }

    protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new WinstonAdapter(
            this.logger.child({ prefix: options.prefix }),
            { ...this.getOptions(), ...options },
        );
    }
}

/**
 * Create a pre-configured Winston logger instance with colorized console output.
 */
export const winstonLogger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, prefix }) => {
            const tag = prefix ? `[${prefix}] ` : '';
            return `${timestamp} ${level}: ${tag}${message}`;
        }),
    ),
    transports: [new winston.transports.Console()],
});

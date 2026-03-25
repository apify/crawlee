import type { CrawleeLogger, CrawleeLoggerOptions } from '@crawlee/types';

import type { LoggerOptions } from '@apify/log';
import log, { Log, Logger, LoggerJson, LoggerText, LogLevel } from '@apify/log';

export type { CrawleeLogger, CrawleeLoggerOptions };

/**
 * Abstract base class for custom Crawlee logger implementations.
 *
 * Subclasses must implement two methods:
 * - {@apilink BaseCrawleeLogger.logWithLevel} — the core logging dispatch
 * - {@apilink BaseCrawleeLogger.createChild} — how to create a child logger instance
 *
 * All other `CrawleeLogger` methods (`error`, `warning`, `info`, `debug`, etc.)
 * are derived automatically. Level filtering is entirely the responsibility of the
 * underlying library — `logWithLevel()` is called for every message.
 *
 * **Example — Winston adapter:**
 * ```typescript
 * const CRAWLEE_TO_WINSTON = { 1: 'error', 2: 'warn', 3: 'warn', 4: 'info', 5: 'debug', 6: 'debug' };
 *
 * class WinstonAdapter extends BaseCrawleeLogger {
 *     constructor(private logger: winston.Logger, options?: Partial<CrawleeLoggerOptions>) {
 *         super(options);
 *     }
 *
 *     logWithLevel(level: number, message: string, data?: Record<string, unknown>): void {
 *         this.logger.log(CRAWLEE_TO_WINSTON[level] ?? 'info', message, data);
 *     }
 *
 *     protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
 *         return new WinstonAdapter(this.logger.child({ prefix: options.prefix }), { ...this.getOptions(), ...options });
 *     }
 * }
 * ```
 */
export abstract class BaseCrawleeLogger implements CrawleeLogger {
    private options: CrawleeLoggerOptions;
    private readonly warningsLogged = new Set<string>();

    constructor(options: Partial<CrawleeLoggerOptions> = {}) {
        this.options = options;
    }

    /**
     * Core logging method. Subclasses must implement this to dispatch log messages
     * to the underlying logger (Winston, Pino, console, etc.).
     *
     * Level filtering is the responsibility of the underlying library — this method
     * is called for every message regardless of the current level.
     *
     * @param level Crawlee log level (use {@apilink LogLevel} constants)
     * @param message The log message
     * @param data Optional structured data to attach to the log entry
     */
    abstract logWithLevel(level: number, message: string, data?: Record<string, unknown>): void;

    /**
     * Creates a child logger instance. Subclasses must implement this to define
     * how child loggers are created for the underlying logger.
     */
    protected abstract createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger;

    getOptions(): CrawleeLoggerOptions {
        return this.options;
    }

    setOptions(options: Partial<CrawleeLoggerOptions>): void {
        this.options = { ...this.options, ...options };
    }

    child(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return this.createChild(options);
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.ERROR, message, data);
    }

    exception(exception: Error, message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.ERROR, `${message}: ${exception.message}`, {
            ...data,
            stack: exception.stack,
            exception,
        });
    }

    softFail(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.SOFT_FAIL, message, data);
    }

    warning(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.WARNING, message, data);
    }

    warningOnce(message: string): void {
        if (!this.warningsLogged.has(message)) {
            this.warningsLogged.add(message);
            this.warning(message);
        }
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.INFO, message, data);
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.DEBUG, message, data);
    }

    perf(message: string, data?: Record<string, unknown>): void {
        this.logWithLevel(LogLevel.PERF, `[PERF] ${message}`, data);
    }

    deprecated(message: string): void {
        this.warningOnce(`[DEPRECATED] ${message}`);
    }
}

/**
 * Adapter that wraps `@apify/log`'s {@apilink Log} instance to implement the {@apilink CrawleeLogger} interface.
 *
 * This is the default logger used by Crawlee when no custom logger is configured.
 * Users who want to use a different logging library should implement {@apilink BaseCrawleeLogger} directly.
 */
export class ApifyLogAdapter extends BaseCrawleeLogger {
    constructor(
        private readonly apifyLog: Log,
        options?: Partial<CrawleeLoggerOptions>,
    ) {
        super(options ?? {});
    }

    logWithLevel(level: number, message: string, data?: Record<string, unknown>): void {
        this.apifyLog.internal(level as LogLevel, message, data);
    }

    protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return new ApifyLogAdapter(this.apifyLog.child({ prefix: options.prefix ?? null }), {
            ...this.getOptions(),
            ...options,
        });
    }
}

export { log, Log, LogLevel, Logger, LoggerJson, LoggerText };
export type { LoggerOptions };

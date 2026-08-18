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
export declare abstract class BaseCrawleeLogger implements CrawleeLogger {
    protected options: CrawleeLoggerOptions;
    protected readonly warningsLogged: Set<string>;
    constructor(options?: Partial<CrawleeLoggerOptions>);
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
    getOptions(): CrawleeLoggerOptions;
    setOptions(options: Partial<CrawleeLoggerOptions>): void;
    child(options: Partial<CrawleeLoggerOptions>): CrawleeLogger;
    error(message: string, data?: Record<string, unknown>): void;
    exception(exception: Error, message: string, data?: Record<string, unknown>): void;
    softFail(message: string, data?: Record<string, unknown>): void;
    warning(message: string, data?: Record<string, unknown>): void;
    warningOnce(message: string): void;
    info(message: string, data?: Record<string, unknown>): void;
    debug(message: string, data?: Record<string, unknown>): void;
    perf(message: string, data?: Record<string, unknown>): void;
    deprecated(message: string): void;
}
/**
 * Adapter that wraps `@apify/log`'s {@apilink Log} instance to implement the {@apilink CrawleeLogger} interface.
 *
 * This is the default logger used by Crawlee when no custom logger is configured.
 * Users who want to use a different logging library should implement {@apilink BaseCrawleeLogger} directly.
 */
export declare class ApifyLogAdapter extends BaseCrawleeLogger {
    private readonly apifyLog;
    constructor(apifyLog: Log, options?: Partial<CrawleeLoggerOptions>);
    logWithLevel(level: number, message: string, data?: Record<string, unknown>): void;
    protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger;
}
export { log, Log, LogLevel, Logger, LoggerJson, LoggerText };
export type { LoggerOptions };

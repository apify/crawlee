import type { LoggerOptions } from '@apify/log';
import log, { Log, Logger, LoggerJson, LoggerText, LogLevel } from '@apify/log';

/**
 * Configuration options for Crawlee logger implementations.
 */
export interface CrawleeLoggerOptions {
    /** Log level threshold. Messages below this level won't be logged. */
    level?: number;
    /** Max depth of data object that will be logged. */
    maxDepth?: number;
    /** Max length of the string to be logged. */
    maxStringLength?: number;
    /** Prefix to be prepended to each logged line. */
    prefix?: string | null;
    /** Suffix to be appended to each logged line. */
    suffix?: string | null;
    /** Additional data to be added to each log line. */
    data?: Record<string, unknown>;
}

/**
 * Interface for Crawlee logger implementations.
 * This allows users to inject custom loggers (e.g., Winston, Pino) while maintaining
 * compatibility with the default `@apify/log` implementation.
 */
export interface CrawleeLogger {
    /**
     * Returns the currently selected logging level.
     */
    getLevel(): number;

    /**
     * Sets the log level to the given value.
     */
    setLevel(level: number): void;

    /**
     * Returns the logger configuration.
     */
    getOptions(): CrawleeLoggerOptions;

    /**
     * Configures logger options.
     */
    setOptions(options: Partial<CrawleeLoggerOptions>): void;

    /**
     * Creates a new instance of logger that inherits settings from a parent logger.
     */
    child(options: Partial<CrawleeLoggerOptions>): CrawleeLogger;

    /**
     * Logs an `ERROR` message.
     */
    error(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs an `ERROR` level message with a nicely formatted exception.
     */
    exception(exception: Error, message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `SOFT_FAIL` level message.
     */
    softFail(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `WARNING` level message.
     */
    warning(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `WARNING` level message only once.
     */
    warningOnce(message: string): void;

    /**
     * Logs an `INFO` message.
     */
    info(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `DEBUG` message.
     */
    debug(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `PERF` level message for performance tracking.
     */
    perf(message: string, data?: Record<string, unknown>): void;

    /**
     * Logs given message only once as WARNING for deprecated features.
     */
    deprecated(message: string): void;

    /**
     * Internal logging method used by some Crawlee internals.
     */
    internal(level: number, message: string, data?: Record<string, unknown>, exception?: Error): void;
}

/**
 * Abstract base class for custom Crawlee logger implementations.
 *
 * Subclasses only need to implement two methods:
 * - {@apilink BaseCrawleeLogger.log} — the core logging dispatch
 * - {@apilink BaseCrawleeLogger.createChild} — how to create a child logger instance
 *
 * All other `CrawleeLogger` methods (`error`, `warning`, `info`, `debug`, etc.)
 * are derived automatically.
 *
 * **Example — Winston adapter in ~15 lines:**
 * ```typescript
 * class WinstonAdapter extends BaseCrawleeLogger {
 *     constructor(private logger: winston.Logger, options?: Partial<CrawleeLoggerOptions>) {
 *         super(options);
 *     }
 *
 *     protected log(level: number, message: string, data?: Record<string, unknown>): void {
 *         const winstonLevel = { 1: 'error', 2: 'warn', 3: 'warn', 4: 'info', 5: 'debug', 6: 'debug' }[level] ?? 'info';
 *         this.logger.log(winstonLevel, message, { ...data, prefix: this.getOptions().prefix });
 *     }
 *
 *     protected createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
 *         return new WinstonAdapter(this.logger.child({ prefix: options.prefix }), { ...this.getOptions(), ...options });
 *     }
 * }
 * ```
 */
export abstract class BaseCrawleeLogger implements CrawleeLogger {
    private level: number;
    private options: CrawleeLoggerOptions;
    private readonly warningsLogged = new Set<string>();

    constructor(options: Partial<CrawleeLoggerOptions> = {}) {
        this.level = options.level ?? LogLevel.INFO;
        this.options = options;
    }

    /**
     * Core logging method. Subclasses must implement this to dispatch log messages
     * to the underlying logger (Winston, Pino, console, etc.).
     *
     * @param level Crawlee log level (use {@apilink LogLevel} constants)
     * @param message The log message
     * @param data Optional structured data to attach to the log entry
     */
    protected abstract log(level: number, message: string, data?: Record<string, unknown>): void;

    /**
     * Creates a child logger instance. Subclasses must implement this to define
     * how child loggers are created for the underlying logger.
     */
    protected abstract createChild(options: Partial<CrawleeLoggerOptions>): CrawleeLogger;

    getLevel(): number {
        return this.level;
    }

    setLevel(level: number): void {
        this.level = level;
    }

    getOptions(): CrawleeLoggerOptions {
        return this.options;
    }

    setOptions(options: Partial<CrawleeLoggerOptions>): void {
        this.options = { ...this.options, ...options };
    }

    child(options: Partial<CrawleeLoggerOptions>): CrawleeLogger {
        return this.createChild(options);
    }

    private dispatch(level: number, message: string, data?: Record<string, unknown>): void {
        if (level <= this.level) {
            this.log(level, message, data);
        }
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.ERROR, message, data);
    }

    exception(exception: Error, message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.ERROR, `${message}: ${exception.message}`, {
            ...data,
            stack: exception.stack,
            exception,
        });
    }

    softFail(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.SOFT_FAIL, message, data);
    }

    warning(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.WARNING, message, data);
    }

    warningOnce(message: string): void {
        if (!this.warningsLogged.has(message)) {
            this.warningsLogged.add(message);
            this.dispatch(LogLevel.WARNING, message);
        }
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.INFO, message, data);
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.DEBUG, message, data);
    }

    perf(message: string, data?: Record<string, unknown>): void {
        this.dispatch(LogLevel.PERF, `[PERF] ${message}`, data);
    }

    deprecated(message: string): void {
        this.warningOnce(`[DEPRECATED] ${message}`);
    }

    internal(level: number, message: string, data?: Record<string, unknown>, exception?: Error): void {
        this.dispatch(level, message, { ...data, ...(exception ? { exception } : {}) });
    }
}

export { log, Log, LogLevel, Logger, LoggerJson, LoggerText };
export type { LoggerOptions };

/**
 * Configuration options for Crawlee logger implementations.
 */
export interface CrawleeLoggerOptions {
    /** Prefix to be prepended to each logged line. */
    prefix?: string | null;
}

/**
 * Options for a single log call.
 */
export interface LogOptions {
    /** Log the message only the first time this logger sees that text, ignoring later calls with it. */
    once?: boolean;
}

/**
 * Interface for Crawlee logger implementations.
 * This allows users to inject custom loggers (e.g., Winston, Pino) while maintaining
 * compatibility with the default `@apify/log` implementation.
 */
export interface CrawleeLogger {
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
    error(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs an `ERROR` level message with a nicely formatted exception.
     */
    exception(exception: Error, message: string, data?: Record<string, unknown>): void;

    /**
     * Logs a `SOFT_FAIL` level message.
     */
    softFail(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs a `WARNING` level message.
     */
    warning(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs a `WARNING` level message only once. Shorthand for `warning(message, undefined, { once: true })`.
     */
    warningOnce(message: string): void;

    /**
     * Logs an `INFO` message.
     */
    info(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs a `DEBUG` message.
     */
    debug(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs a `PERF` level message for performance tracking.
     */
    perf(message: string, data?: Record<string, unknown>, options?: LogOptions): void;

    /**
     * Logs given message only once as WARNING for deprecated features.
     */
    deprecated(message: string): void;

    /**
     * Logs a message at the given level. Useful when the log level is determined dynamically.
     */
    logWithLevel(level: number, message: string, data?: Record<string, unknown>): void;
}

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
    error(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs an `ERROR` level message with a nicely formatted exception.
     */
    exception(exception: Error, message: string, data?: Record<string, any> | null): void;

    /**
     * Logs a `SOFT_FAIL` level message.
     */
    softFail(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs a `WARNING` level message.
     */
    warning(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs a `WARNING` level message only once.
     */
    warningOnce(message: string): void;

    /**
     * Logs an `INFO` message.
     */
    info(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs a `DEBUG` message.
     */
    debug(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs a `PERF` level message for performance tracking.
     */
    perf(message: string, data?: Record<string, any> | null): void;

    /**
     * Logs given message only once as WARNING for deprecated features.
     */
    deprecated(message: string): void;

    /**
     * Internal logging method used by some Crawlee internals.
     */
    internal(level: number, message: string, data?: any, exception?: any): void;

    /**
     * Map of available log levels.
     * The default `@apify/log` implementation exposes `LogLevel` values here.
     * Custom implementations may omit this property.
     */
    LEVELS?: typeof LogLevel;
}

export { log, Log, LogLevel, Logger, LoggerJson, LoggerText };
export type { LoggerOptions };

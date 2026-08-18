import log, { Log, Logger, LoggerJson, LoggerText, LogLevel } from '@apify/log';
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
export class BaseCrawleeLogger {
    options;
    warningsLogged = new Set();
    constructor(options = {}) {
        this.options = options;
    }
    getOptions() {
        return this.options;
    }
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }
    child(options) {
        return this.createChild(options);
    }
    error(message, data) {
        this.logWithLevel(LogLevel.ERROR, message, data);
    }
    exception(exception, message, data) {
        this.logWithLevel(LogLevel.ERROR, `${message}: ${exception.message}`, {
            ...data,
            stack: exception.stack,
            exception,
        });
    }
    softFail(message, data) {
        this.logWithLevel(LogLevel.SOFT_FAIL, message, data);
    }
    warning(message, data) {
        this.logWithLevel(LogLevel.WARNING, message, data);
    }
    warningOnce(message) {
        if (!this.warningsLogged.has(message)) {
            this.warningsLogged.add(message);
            this.warning(message);
        }
    }
    info(message, data) {
        this.logWithLevel(LogLevel.INFO, message, data);
    }
    debug(message, data) {
        this.logWithLevel(LogLevel.DEBUG, message, data);
    }
    perf(message, data) {
        this.logWithLevel(LogLevel.PERF, `[PERF] ${message}`, data);
    }
    deprecated(message) {
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
    apifyLog;
    constructor(
    // kept as a TS-private parameter property: reached through the adaptive crawler's log proxy, see above
    apifyLog, options) {
        super(options ?? {});
        this.apifyLog = apifyLog;
    }
    logWithLevel(level, message, data) {
        this.apifyLog.internal(level, message, data);
    }
    createChild(options) {
        return new ApifyLogAdapter(this.apifyLog.child({ prefix: options.prefix ?? null }), {
            ...this.getOptions(),
            ...options,
        });
    }
}
export { log, Log, LogLevel, Logger, LoggerJson, LoggerText };

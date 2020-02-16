declare module 'apify-shared/log' {
    export interface LoggerOptions {
        /**
         * Sets the log level to the given value, preventing messages from less important log levels
         * from being printed to the console. Use in conjunction with the `log.LEVELS` constants.
         */
        level: number;
        /**
         * Max depth of data object that will be logged. Anything deeper than the limit will be stripped off.
         */
        maxDepth: number;
        /**
         * Max length of the string to be logged. Longer strings will be truncated.
         */
        maxStringLength: number;
        /**
         * Prefix to be prepended the each logged line.
         */
        prefix: string;
        /**
         * Suffix that will be appended the each logged line.
         */
        suffix: string;
        /**
         * Logger implementation to be used. Default one is log.LoggerText to log messages as easily readable
         * strings. Optionally you can use `log.LoggerJson` that formats each log line as a JSON.
         */
        logger: any;
        /**
         * Additional data to be added to each log line.
         */
        data: any;
    }

    /**
     * The log instance enables level aware logging of messages and we advise
     * to use it instead of `console.log()` and its aliases in most development
     * scenarios.
     *
     * A very useful use case for `log` is using `log.debug` liberally throughout
     * the codebase to get useful logging messages only when appropriate log level is set
     * and keeping the console tidy in production environments.
     *
     * The available logging levels are, in this order: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `OFF`
     * and can be referenced from the `log.LEVELS` constant, such as `log.LEVELS.ERROR`.
     *
     * To log messages to the system console, use the `log.level(message)` invocation,
     * such as `log.debug('this is a debug message')`.
     *
     * To prevent writing of messages above a certain log level to the console, simply
     * set the appropriate level. The default log level is `INFO`, which means that
     * `DEBUG` messages will not be printed, unless enabled.
     *
     * **Example:**
     * ```
     * const Apify = require('apify');
     * const { log } = Apify.utils;
     *
     * log.info('Information message', { someData: 123 }); // prints message
     * log.debug('Debug message', { debugData: 'hello' }); // doesn't print anything
     *
     * log.setLevel(log.LEVELS.DEBUG);
     * log.debug('Debug message'); // prints message
     *
     * log.setLevel(log.LEVELS.ERROR);
     * log.debug('Debug message'); // doesn't print anything
     * log.info('Info message'); // doesn't print anything
     *
     * log.error('Error message', { errorDetails: 'This is bad!' }); // prints message
     * try {
     *   throw new Error('Not good!');
     * } catch (e) {
     *   log.exception(e, 'Exception occurred', { errorDetails: 'This is really bad!' }); // prints message
     * }
     *
     * log.setOptions({ prefix: 'My actor' });
     * log.info('I am running!'); // prints "My actor: I am running"
     *
     * const childLog = log.child({ prefix: 'Crawler' });
     * log.info('I am crawling!'); // prints "My actor:Crawler: I am crawling"
     * ```
     *
     * Another very useful way of setting the log level is by setting the `APIFY_LOG_LEVEL`
     * environment variable, such as `APIFY_LOG_LEVEL=DEBUG`. This way, no code changes
     * are necessary to turn on your debug messages and start debugging right away.
     */
    export class Log {
        deprecationsReported: any;
        options: LoggerOptions;
        constructor(options: Partial<LoggerOptions>);
        getLevel(): LEVELS;
        setLevel(level: LEVELS): void;
        internal(level: LEVELS, message: string, data: any, exception: any): void;
        setOptions(options: Partial<LoggerOptions>): void;
        getOptions(): LoggerOptions;
        child(options: Partial<LoggerOptions>): Log;
        error(message: string, data?: any): void;
        exception(exception: Error, message?: string, data?: any): void;
        softFail(message: string, data?: any): void;
        warning(message: string, data?: any): void;
        info(message: string, data?: any): void;
        debug(message: string, data?: any): void;
        perf(message: string, data?: any): void;
        deprecated(message: string): void;
    }

    export const LoggerText: any;
    export const LoggerJson: any;

    /**
     * Map of available log levels that's useful for easy setting of appropriate log levels.
     * Each log level is represented internally by a number. Eg. `log.LEVELS.DEBUG === 5`.
     */
    export enum LEVELS {
        // Turns off logging completely
        OFF = 0,
        // For unexpected errors in Apify system
        ERROR = 1,
        // For situations where error is caused by user (e.g. Meteor.Error), i.e. when the error is not
        // caused by Apify system, avoid the word "ERROR" to simplify searching in log
        SOFT_FAIL = 2,
        WARNING = 3,
        INFO = 4,
        DEBUG = 5,
        // for performance stats
        PERF = 6
    }

    // The shape of the Log class can't be easily typed in TS because it
    // dynamically attaches values to the log instance, so we need to document
    // only the "inner" functions of the Log class, and not the class itself
    // That's why the export consts below:

    /**
     * Returns the currently selected logging level. This is useful for checking whether a message
     * will actually be printed to the console before one actually performs a resource intensive operation
     * to construct the message, such as querying a DB for some metadata that need to be added. If the log
     * level is not high enough at the moment, it doesn't make sense to execute the query.
     */
    export const getLevel: Log['getLevel'];
    /**
     * Sets the log level to the given value, preventing messages from less important log levels
     * from being printed to the console. Use in conjunction with the `log.LEVELS` constants such as
     *
     * ```
     * log.setLevel(log.LEVELS.DEBUG);
     * ```
     *
     * Default log level is INFO.
     */
    export const setLevel: Log['setLevel'];
    /**
     * Configures logger.
     */
    export const setOptions: Log['setOptions'];
    /**
     * Returns the logger configuration.
     */
    export const getOptions: Log['getOptions'];
    /**
     * Creates a new instance of logger that inherits settings from a parent logger.
     */
    export const child: Log['child'];
    /**
     * Logs an `ERROR` message. Use this method to log error messages that are not directly connected
     * to an exception. For logging exceptions, use the `log.exception` method.
     */
    export const error: Log['error'];
    /**
     * Logs an `ERROR` level message with a nicely formatted exception. Note that the exception is the first parameter
     * here and an additional message is only optional.
     */
    export const exception: Log['exception'];
    /**
     * Logs a `WARNING` level message. Data are stringified and appended to the message.
     */
    export const warning: Log['warning'];
    /**
     * Logs an `INFO` message. `INFO` is the default log level so info messages will be always logged,
     * unless the log level is changed. Data are stringified and appended to the message.
     */
    export const info: Log['info'];
    /**
     * Logs a `DEBUG` message. By default, it will not be written to the console. To see `DEBUG`
     * messages in the console, set the log level to `DEBUG` either using the `log.setLevel(log.LEVELS.DEBUG)`
     * method or using the environment variable `APIFY_LOG_LEVEL=DEBUG`. Data are stringified and appended
     * to the message.
     */
    export const debug: Log['debug'];
    /**
     * Logs given message only once as WARNING. It's used to warn user that some feature he is using
     * has been deprecated.
     */
    export const deprecated: Log['deprecated'];
}

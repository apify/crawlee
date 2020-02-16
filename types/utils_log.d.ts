/// <reference path="../types-apify/apify-shared/log.d.ts" />
export default Log;
export type LoggerOptions = {
    /**
     * Sets the log level to the given value, preventing messages from less important log levels
     * from being printed to the console. Use in conjunction with the `log.LEVELS` constants.
     */
    level?: number;
    /**
     * Max depth of data object that will be logged. Anything deeper than the limit will be stripped off.
     */
    maxDepth?: number;
    /**
     * Max length of the string to be logged. Longer strings will be truncated.
     */
    maxStringLength?: number;
    /**
     * Prefix to be prepended the each logged line.
     */
    prefix?: string;
    /**
     * Suffix that will be appended the each logged line.
     */
    suffix?: string;
    /**
     * Logger implementation to be used. Default one is log.LoggerText to log messages as easily readable
     * strings. Optionally you can use `log.LoggerJson` that formats each log line as a JSON.
     */
    logger?: Object;
    /**
     * Additional data to be added to each log line.
     */
    data?: Object;
};
import * as Log from "apify-shared/log";

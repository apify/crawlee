declare namespace ApifyLog {
    export interface LogOptions {
        level: LEVELS;
        maxDepth: number;
        maxStringLength: number;
        prefix: string | null;
        suffix: string | null;
        logger: any;
        data: any;
    }

    export class Log {
        deprecationsReported: any;
        options: LogOptions;
        constructor(options: Partial<LogOptions>);
        getLevel(): LEVELS;
        setLevel(level: LEVELS): void;
        internal(level: LEVELS, message: string, data: any, exception: any): void;
        setOptions(options: Partial<LogOptions>): void;
        getOptions(): LogOptions;
        child(options: LogOptions): Log;
        error(message: string, data?: any): void;
        exception(exception: Error, message?: string, data?: any): void;
        softFail(message: string, data?: any): void;
        warning(message: string, data?: any): void;
        info(message: string, data?: any): void;
        debug(message: string, data?: any): void;
        perf(message: string, data: any): void;
        /**
         * Logs given message only once as WARNING. It's used to warn user that some feature he is using
         * has been deprecated.
         */
        deprecated(message: string): void;
    }

    export const LoggerText: any;
    export const LoggerJson: any;

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
}

declare module 'apify-shared/log' {
    export const LEVELS: ApifyLog.LEVELS;
    export const Log: typeof ApifyLog.Log;
    const instance: ApifyLog.Log;
    export default instance;
}

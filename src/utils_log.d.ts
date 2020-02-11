declare module log {
        const LEVELS: {
            // Turns off logging completely
            OFF: number,
            // For unexpected errors in Apify system
            ERROR: number,
            // For situations where error is caused by user (e.g. Meteor.Error), i.e. when the error is not
            // caused by Apify system, avoid the word "ERROR" to simplify searching in log
            SOFT_FAIL: number,
            WARNING: number,
            INFO: number,
            DEBUG: number,
            // for performance stats
            PERF: number
        };

        let logJson: boolean;

        // Indicates whether DEBUG messages will be printed or not
        let isDebugMode: boolean;

        // Sets log level
        function setLevel(level: number): void;

        function getLevel(): number;

        // Helper functions for common usage
        function warning(message: string, data?: any): void;

        function info(message: string, data?: any): void;

        function debug(message: string, data?: any): void;

        function error(message: string, data?: any): void;

        function exception(exception: Error, message?: string, data?: any): void;
}

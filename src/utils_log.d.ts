declare module log {
        const LEVELS: {
            // Turns off logging completely
            OFF: number,
            // For unexpected errors in Apify system
            ERROR: number,
            WARNING: number,
            INFO: number,
            DEBUG: number,
            // for performance stats
            PERF: number
        };

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

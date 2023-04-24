/**
 * Node.js Error interface
 */
interface ErrnoException extends Error {
    errno?: number | undefined;
    code?: string | number | undefined;
    path?: string | undefined;
    syscall?: string | undefined;
    cause?: any;
}
export interface ErrorTrackerOptions {
    showErrorCode: boolean;
    showErrorName: boolean;
    showStackTrace: boolean;
    showFullStack: boolean;
    showErrorMessage: boolean;
    showFullMessage: boolean;
}
/**
 * This class tracks errors and computes a summary of information like:
 * - where the errors happened
 * - what the error names are
 * - what the error codes are
 * - what is the general error message
 *
 * This is extremely useful when there are dynamic error messages, such as argument validation.
 *
 * Since the structure of the `tracker.result` object differs when using different options,
 * it's typed as `Record<string, unknown>`. The most deep object has a `count` property, which is a number.
 *
 * It's possible to get the total amount of errors via the `tracker.total` property.
 */
export declare class ErrorTracker {
    #private;
    result: Record<string, unknown>;
    total: number;
    constructor(options?: Partial<ErrorTrackerOptions>);
    add(error: ErrnoException): void;
    getUniqueErrorCount(): number;
    getMostPopularErrors(count: number): [number, string[]][];
    reset(): void;
}
export {};
//# sourceMappingURL=error_tracker.d.ts.map
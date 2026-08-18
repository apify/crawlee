import type { CrawlingContext } from '../crawlers/crawler_commons.js';
import { ErrorSnapshotter } from './error_snapshotter.js';
import type { SnapshottableProperties } from './internals/types.js';
/**
 * Node.js Error interface
 */
export interface ErrnoException extends Error {
    errno?: number;
    code?: string | number;
    path?: string;
    syscall?: string;
    cause?: any;
}
export interface ErrorTrackerOptions {
    showErrorCode: boolean;
    showErrorName: boolean;
    showStackTrace: boolean;
    showFullStack: boolean;
    showErrorMessage: boolean;
    showFullMessage: boolean;
    saveErrorSnapshots: boolean;
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
    errorSnapshotter?: ErrorSnapshotter;
    constructor(options?: Partial<ErrorTrackerOptions>);
    private updateGroup;
    add(error: ErrnoException): void;
    /**
     * This method is async, because it captures a snapshot of the error context.
     * We added this new method to avoid breaking changes.
     */
    addAsync(error: ErrnoException, context?: CrawlingContext): Promise<void>;
    getUniqueErrorCount(): number;
    getMostPopularErrors(count: number): [number, string[]][];
    captureSnapshot(storage: Record<string, unknown>, error: ErrnoException, context: CrawlingContext & SnapshottableProperties): Promise<void>;
    reset(): void;
}

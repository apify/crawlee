import type { CrawlingContext } from '../crawlers/crawler_commons.js';
import type { KeyValueStore } from '../storages/key_value_store.js';
import type { ErrnoException } from './error_tracker.js';
import type { SnapshottableProperties } from './internals/types.js';
interface BrowserCrawlingContext {
    saveSnapshot: (options: {
        key: string;
    }) => Promise<void>;
}
export interface SnapshotResult {
    screenshotFileName?: string;
    htmlFileName?: string;
}
interface ErrorSnapshot {
    screenshotFileName?: string;
    screenshotFileUrl?: string;
    htmlFileName?: string;
    htmlFileUrl?: string;
}
/**
 * ErrorSnapshotter class is used to capture a screenshot of the page and a snapshot of the HTML when an error occurs during web crawling.
 *
 * This functionality is opt-in, and can be enabled via the crawler options:
 *
 * ```ts
 * const crawler = new BasicCrawler({
 *   // ...
 *   statistics: new Statistics({ saveErrorSnapshots: true }),
 * });
 * ```
 */
export declare class ErrorSnapshotter {
    static readonly MAX_ERROR_CHARACTERS = 30;
    static readonly MAX_HASH_LENGTH = 30;
    static readonly MAX_FILENAME_LENGTH = 250;
    static readonly BASE_MESSAGE = "An error occurred";
    static readonly SNAPSHOT_PREFIX = "ERROR_SNAPSHOT";
    /**
     * Capture a snapshot of the error context.
     */
    captureSnapshot(error: ErrnoException, context: CrawlingContext & SnapshottableProperties): Promise<ErrorSnapshot>;
    /**
     * Captures a snapshot of the current page using the context.saveSnapshot function.
     * This function is applicable for browser contexts only.
     * Returns an object containing the filenames of the screenshot and HTML file.
     */
    contextCaptureSnapshot(context: BrowserCrawlingContext, fileName: string): Promise<SnapshotResult | undefined>;
    /**
     * Save the HTML snapshot of the page, and return the key it was stored under.
     */
    saveHTMLSnapshot(html: string, keyValueStore: Pick<KeyValueStore, 'setValue'>, fileName: string): Promise<string | undefined>;
    /**
     * Generate a unique fileName for each error snapshot.
     */
    generateFilename(error: ErrnoException): string;
}
export {};

import crypto from 'node:crypto';

import type { ErrnoException } from './error_tracker';
import type { CrawlingContext } from '../crawlers/crawler_commons';
import type { KeyValueStore } from '../storages';

// Define the following types as we cannot import the complete types from the respective packages
interface BrowserCrawlingContext {
    saveSnapshot: (options: { key: string }) => Promise<void>;
}

interface BrowserPage {
    content: () => Promise<string>;
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
 *   statisticsOptions: {
 *     saveErrorSnapshots: true,
 *   },
 * });
 * ```
 */
export class ErrorSnapshotter {
    static readonly MAX_ERROR_CHARACTERS = 30;
    static readonly MAX_HASH_LENGTH = 30;
    static readonly MAX_FILENAME_LENGTH = 250;
    static readonly BASE_MESSAGE = 'An error occurred';
    static readonly SNAPSHOT_PREFIX = 'ERROR_SNAPSHOT';

    /**
     * Capture a snapshot of the error context.
     */
    async captureSnapshot(error: ErrnoException, context: CrawlingContext): Promise<ErrorSnapshot> {
        try {
            const page = context?.page as BrowserPage | undefined;
            const body = context?.body;

            const keyValueStore = await context?.getKeyValueStore();
            // If the key-value store is not available, or the body and page are not available, return empty filenames
            if (!keyValueStore || (!body && !page)) {
                return {};
            }

            const fileName = this.generateFilename(error);

            let screenshotFileName: string | undefined;
            let htmlFileName: string | undefined;

            if (page) {
                const capturedFiles = await this.contextCaptureSnapshot(
                    context as unknown as BrowserCrawlingContext,
                    fileName,
                );

                if (capturedFiles) {
                    screenshotFileName = capturedFiles.screenshotFileName;
                    htmlFileName = capturedFiles.htmlFileName;
                }

                // If the snapshot for browsers failed to capture the HTML, try to capture it from the page content
                if (!htmlFileName) {
                    const html = await page.content();
                    htmlFileName = html ? await this.saveHTMLSnapshot(html, keyValueStore, fileName) : undefined;
                }
            } else if (typeof body === 'string') {
                // for non-browser contexts
                htmlFileName = await this.saveHTMLSnapshot(body, keyValueStore, fileName);
            }

            return {
                screenshotFileName,
                screenshotFileUrl: screenshotFileName && keyValueStore.getPublicUrl(screenshotFileName),
                htmlFileName,
                htmlFileUrl: htmlFileName && keyValueStore.getPublicUrl(htmlFileName),
            };
        } catch {
            return {};
        }
    }

    /**
     * Captures a snapshot of the current page using the context.saveSnapshot function.
     * This function is applicable for browser contexts only.
     * Returns an object containing the filenames of the screenshot and HTML file.
     */
    async contextCaptureSnapshot(
        context: BrowserCrawlingContext,
        fileName: string,
    ): Promise<SnapshotResult | undefined> {
        try {
            await context.saveSnapshot({ key: fileName });
            return {
                screenshotFileName: `${fileName}.jpg`,
                htmlFileName: `${fileName}.html`,
            };
        } catch {
            return undefined;
        }
    }

    /**
     * Save the HTML snapshot of the page, and return the fileName with the extension.
     */
    async saveHTMLSnapshot(html: string, keyValueStore: KeyValueStore, fileName: string): Promise<string | undefined> {
        try {
            await keyValueStore.setValue(fileName, html, { contentType: 'text/html' });
            return `${fileName}.html`;
        } catch {
            return undefined;
        }
    }

    /**
     * Generate a unique fileName for each error snapshot.
     */
    generateFilename(error: ErrnoException): string {
        const { SNAPSHOT_PREFIX, BASE_MESSAGE, MAX_HASH_LENGTH, MAX_ERROR_CHARACTERS, MAX_FILENAME_LENGTH } =
            ErrorSnapshotter;
        // Create a hash of the error stack trace
        const errorStackHash = crypto
            .createHash('sha1')
            .update(error.stack || error.message || '')
            .digest('hex')
            .slice(0, MAX_HASH_LENGTH);
        const errorMessagePrefix = (error.message || BASE_MESSAGE).slice(0, MAX_ERROR_CHARACTERS).trim();

        /**
         * Remove non-word characters from the start and end of a string.
         */
        const sanitizeString = (str: string): string => {
            return str.replace(/^\W+|\W+$/g, '');
        };

        // Generate fileName and remove disallowed characters
        const fileName = `${SNAPSHOT_PREFIX}_${sanitizeString(errorStackHash)}_${sanitizeString(errorMessagePrefix)}`
            .replace(/\W+/g, '-') // Replace non-word characters with a dash
            .slice(0, MAX_FILENAME_LENGTH);

        return fileName;
    }
}

import crypto from 'node:crypto';

import type { KeyValueStore, CrawlingContext } from '@crawlee/core';
import type { PlaywrightCrawlingContext } from '@crawlee/playwright';
import type { PuppeteerCrawlingContext } from '@crawlee/puppeteer';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';

import type { ErrnoException } from './error_tracker';

const { PWD, CRAWLEE_STORAGE_DIR, APIFY_IS_AT_HOME } = process.env;

/**
 * ErrorSnapshotter class is used to capture a screenshot of the page and a snapshot of the HTML when an error occur during web crawling.
 */
export class ErrorSnapshotter {
    static readonly MAX_ERROR_CHARACTERS = 30;
    static readonly BASE_MESSAGE = 'An error occurred';
    static readonly SNAPSHOT_PREFIX = 'SNAPSHOT';
    static readonly KEY_VALUE_PLATFORM_PATH = 'https://api.apify.com/v2/key-value-stores';
    static readonly KEY_VALUE_STORE_LOCAL_PATH = `file://${PWD}/${CRAWLEE_STORAGE_DIR}/key_value_stores` || `file://${PWD}/storage/key_value_stores`;

    /**
     * Capture a snapshot of the error context.
     */
    async captureSnapshot(error: ErrnoException, context: CrawlingContext): Promise<{ screenshotFilename?: string; htmlFileName?: string }> {
        const page = context?.page as PuppeteerPage | PlaywrightPage | undefined;
        const body = context?.body;

        const keyValueStore = await context?.getKeyValueStore();
        // If the key-value store is not available, or the body and page are not available, return empty filenames
        if (!keyValueStore || (!body && !page)) {
            return {};
        }

        const filename = this.generateFilename(error);

        let screenshotFilename: string | undefined;
        let htmlFileName: string | undefined;

        if (page) {
            const capturedFiles = await this.captureSnapShot(
                context as
                | PlaywrightCrawlingContext
                | PuppeteerCrawlingContext,
                filename,
            );

            if (capturedFiles) {
                screenshotFilename = capturedFiles.screenshotFilename;
                htmlFileName = capturedFiles.htmlFileName;
            }

            // If the snapshot for browsers failed to capture the HTML, try to capture it from the page content
            if (!htmlFileName) {
                const html = await page?.content() || undefined;
                htmlFileName = html ? await this.saveHTMLSnapshot(html, keyValueStore, filename) : undefined;
            }
        } else if (typeof body === 'string') { // for non-browser contexts
            htmlFileName = await this.saveHTMLSnapshot(body, keyValueStore, filename);
        }

        if (APIFY_IS_AT_HOME) {
            const platformPath = `${ErrorSnapshotter.KEY_VALUE_PLATFORM_PATH}/${keyValueStore.id}/records`;
            return {
                screenshotFilename: screenshotFilename ? `${platformPath}/${screenshotFilename}` : undefined,
                htmlFileName: htmlFileName ? `${platformPath}/${htmlFileName}` : undefined,
            };
        }

        const localPath = `${ErrorSnapshotter.KEY_VALUE_STORE_LOCAL_PATH}/${keyValueStore.name || 'default'}`;
        return {
            screenshotFilename: screenshotFilename ? `${localPath}/${screenshotFilename}` : undefined,
            htmlFileName: htmlFileName ? `${localPath}/${htmlFileName}` : undefined,
        };
    }

    /**
     * Capture a screenshot and HTML of the page (For Browser only), and return the filename with the extension.
     */
    async captureSnapShot(
        context: PlaywrightCrawlingContext | PuppeteerCrawlingContext,
        filename: string): Promise<{
            screenshotFilename?: string;
            htmlFileName?: string;
        } | undefined> {
        try {
            await context.saveSnapshot({ key: filename });
            return {
                screenshotFilename: `${filename}.jpg`,
                htmlFileName: `${filename}.html`,
            };
        } catch (e) {
            return undefined;
        }
    }

    /**
     * Save the HTML snapshot of the page, and return the filename with the extension.
     */
    async saveHTMLSnapshot(html: string, keyValueStore: KeyValueStore, filename: string): Promise<string | undefined> {
        try {
            await keyValueStore.setValue(filename, html, { contentType: 'text/html' });
            return `${filename}.html`;
        } catch (e) {
            return undefined;
        }
    }

    /**
     * Generate a unique filename for each error snapshot.
     */
    // Method to generate a unique filename for each error snapshot
    generateFilename(error: ErrnoException): string {
        // Create a hash of the error stack trace
        const errorStackHash = crypto.createHash('sha1').update(error.stack || '').digest('hex').slice(0, 30);
        // Extract the first 30 characters of the error message
        const errorMessagePrefix = (
            error.message || ErrorSnapshotter.BASE_MESSAGE
        ).slice(0, ErrorSnapshotter.MAX_ERROR_CHARACTERS);

        // Generate filename and remove disallowed characters
        let filename = `${ErrorSnapshotter.SNAPSHOT_PREFIX}_${errorStackHash}_${errorMessagePrefix}`;
        filename = filename.replace(/[^a-zA-Z0-9!-_.]/g, '-');

        // Ensure filename is not too long
        if (filename.length > 250) {
            filename = filename.slice(0, 250); // 250 to allow space for the extension
        }

        return filename;
    }
}

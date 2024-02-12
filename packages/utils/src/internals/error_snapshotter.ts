import * as crypto from 'crypto';

import type { CrawlingContext } from '@crawlee/basic';
import type { ErrnoException } from '@crawlee/utils';
import type { KeyValueStore } from 'packages/core/src/storages';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';

/**
 * ErrorSnapshotter class is used to capture a screenshot of the page and a snapshot of the HTML when an error occur during web crawling.
 */
export class ErrorSnapshotter {
    static readonly MAX_ERROR_CHARACTERS = 30;
    static readonly BASE_MESSAGE = 'An error occurred';
    static readonly SNAPSHOT_PREFIX = 'SNAPSHOT';
    static readonly KEY_VALUE_STORE_PATH = 'https://api.apify.com/v2/key-value-stores';

    /**
     * Capture a snapshot of the error context.
     */
    async captureSnapshot(error: ErrnoException, context: CrawlingContext): Promise<{ screenshotFilename?: string; htmlFilename?: string }> {
        const page = context?.page as PuppeteerPage | PlaywrightPage | undefined;
        const body = context?.body;

        const keyValueStore = await context?.getKeyValueStore();
        // If the key-value store is not available, or the body and page are not available, return empty filenames
        if (!keyValueStore || (!body && !page)) {
            return {};
        }

        const filename = this.generateFilename(error);
        const screenshotFilename = page ? await this.captureScreenshot(page, keyValueStore, filename) : undefined;

        let htmlFilename: string | undefined;
        if (typeof body === 'string') {
            htmlFilename = await this.saveHTMLSnapshot(body, keyValueStore, filename);
        } else if (page) {
            const html = await page?.content() || '';
            htmlFilename = html ? await this.saveHTMLSnapshot(html, keyValueStore, filename) : '';
        }

        const basePath = `${ErrorSnapshotter.KEY_VALUE_STORE_PATH}/${keyValueStore.id}/records`;

        return {
            screenshotFilename: screenshotFilename ? `${basePath}/${screenshotFilename}` : undefined,
            htmlFilename: htmlFilename ? `${basePath}/${htmlFilename}` : undefined,
        };
    }

    /**
     * Capture a screenshot of the page (For Browser only), and return the filename with the extension.
     */
    async captureScreenshot(page: PuppeteerPage | PlaywrightPage, keyValueStore: KeyValueStore, filename: string): Promise<string | undefined> {
        try {
            const screenshotBuffer = await page.screenshot();

            await keyValueStore.setValue(filename, screenshotBuffer, { contentType: 'image/png' });
            return `${filename}.png`;
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
        ).substring(0, Math.min(ErrorSnapshotter.MAX_ERROR_CHARACTERS, error.message?.length || 0));

        // Generate filename and remove disallowed characters
        let filename = `${ErrorSnapshotter.SNAPSHOT_PREFIX}_${errorStackHash}_${errorMessagePrefix}`;
        filename = filename.replace(/[^a-zA-Z0-9!-_.]/g, '');

        // Ensure filename is not too long
        if (filename.length > 250) {
            filename = filename.slice(0, 250); // to allow space for the extension
        }

        return filename;
    }
}

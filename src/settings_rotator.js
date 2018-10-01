import { checkParamOrThrow } from 'apify-client/build/utils';

// TODO: randomWaitBetweenUsagesMillis

/**
 * Rotates settings created by a user-provided function passed
 * via `newSettingsFunction`.
 * This is useful during web crawling to dynamically change settings and thus
 * avoid detection of the crawler.
 *
 * This class is still work in progress, more features will be added soon.
 *
 * @param {Object} options
 * @param {Function} options.newSettingsFunction
 * @param {Number} options.maxUsages
 * @ignore
 */
export default class SettingsRotator {
    constructor(opts) {
        checkParamOrThrow(opts, 'options', 'Object');

        const {
            newSettingsFunction,
            maxUsages,
        } = opts;

        checkParamOrThrow(newSettingsFunction, 'options.newSettingsFunction', 'Function');
        checkParamOrThrow(maxUsages, 'options.maxUsages', 'Number');

        this.maxUsages = maxUsages;
        this.newSettingsFunction = newSettingsFunction;

        this.currentSettings = null;
        this.currentSettingsUsageCount = 0;
    }

    /**
     * Fetches a settings object.
     *
     * @return {*}
     */
    fetchSettings() {
        if (!this.currentSettings || this.currentSettingsUsageCount >= this.maxUsages) {
            this.currentSettings = this.newSettingsFunction();
            this.currentSettingsUsageCount = 0;
        }

        this.currentSettingsUsageCount++;

        return this.currentSettings;
    }

    /**
     * Reclaims settings after use.
     *
     * @param {*} settings
     */
    reclaimSettings(settings) {} // eslint-disable-line
}

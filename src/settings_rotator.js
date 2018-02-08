import { checkParamOrThrow } from 'apify-client/build/utils';

// TODO: randomWaitBetweenUsagesMillis

/**
 * SettingsRotator rotates settings created by newSettingsFunction based on it's configuration.
 *
 * @param {Object} options
 * @param {Function} options.newSettingsFunction
 * @param {Number} options.maxUsages
 */
export default class SettingsRotator {
    constructor({
        newSettingsFunction,
        maxUsages,
    }) {
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

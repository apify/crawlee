import { checkParamOrThrow } from 'apify-client/build/utils';

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

    fetchSettings() {
        if (!this.currentSettings || this.currentSettingsUsageCount >= this.maxUsages) {
            this.currentSettings = this.newSettingsFunction();
            this.currentSettingsUsageCount = 0;
        }

        this.currentSettingsUsageCount++;

        return this.currentSettings;
    }

    reclaimSettings() {} // eslint-disable-line
}

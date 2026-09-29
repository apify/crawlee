import type { FingerprintGeneratorOptions as FingerprintOptionsOriginal } from 'fingerprint-generator';

export interface FingerprintGeneratorOptions extends Partial<FingerprintOptionsOriginal> {}

export enum BrowserName {
    chrome = 'chrome',
    firefox = 'firefox',
    safari = 'safari',
    edge = 'edge',
}

export enum OperatingSystemsName {
    linux = 'linux',
    macos = 'macos',
    windows = 'windows',
    /**
     * `android` is (mostly) a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    android = 'android',
    /**
     * `ios` is a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    ios = 'ios',
}

export enum DeviceCategory {
    /**
     * Describes mobile devices (mobile phones, tablets...). These devices usually have smaller, vertical screens and load lighter versions of websites.
     * > Note: Generating `android` and `ios` devices will not work without setting the device to `mobile` first.
     */
    mobile = 'mobile',
    /**
     * Describes desktop computers and laptops. These devices usually have larger, horizontal screens and load full-sized versions of websites.
     */
    desktop = 'desktop',
}

import type {
    BrowserFingerprintWithHeaders as Fingerprint,
    FingerprintGeneratorOptions as FingerprintOptionsOriginal,
} from 'fingerprint-generator';

export interface FingerprintGenerator {
    getFingerprint: (fingerprintGeneratorOptions?: FingerprintGeneratorOptions) => GetFingerprintReturn;
}

export interface GetFingerprintReturn {
    fingerprint: Fingerprint;
}

export interface FingerprintGeneratorOptions extends Partial<FingerprintOptionsOriginal> {}

const SUPPORTED_HTTP_VERSIONS = ['1', '2'] as const;

/**
 * String specifying the HTTP version to use.
 */
type HttpVersion = (typeof SUPPORTED_HTTP_VERSIONS)[number];

export enum BrowserName {
    chrome = 'chrome',
    firefox = 'firefox',
    safari = 'safari',
    edge = 'edge',
}

export interface BrowserSpecification {
    /**
     * String representing the browser name.
     */
    name: BrowserName;
    /**
     * Minimum version of browser used.
     */
    minVersion?: number;
    /**
     * Maximum version of browser used.
     */
    maxVersion?: number;
    /**
     * HTTP version to be used for header generation (the headers differ depending on the version).
     */
    httpVersion?: HttpVersion;
}

export const enum OperatingSystemsName {
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

export const enum DeviceCategory {
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

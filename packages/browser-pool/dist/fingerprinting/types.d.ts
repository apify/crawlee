import type { BrowserFingerprintWithHeaders as Fingerprint } from 'fingerprint-generator';
export interface FingerprintGenerator {
    getFingerprint: (fingerprintGeneratorOptions?: FingerprintGeneratorOptions) => GetFingerprintReturn;
}
export interface GetFingerprintReturn {
    fingerprint: Fingerprint;
}
export interface FingerprintGeneratorOptions {
    /**
    * List of `BrowserSpecification` objects
    * or one of `chrome`, `edge`, `firefox` and `safari`.
    */
    browsers?: BrowserSpecification[] | BrowserName[];
    /**
    * Browser generation query based on the real world data.
    *  For more info see the [query docs](https://github.com/browserslist/browserslist#full-list).
    *
    * > Note: If `browserListQuery` is passed, the `browsers` array is ignored.
    */
    browserListQuery?: string;
    /**
    * List of operating systems to generate the headers for.
    */
    operatingSystems?: OperatingSystemsName[];
    /**
    * List of device types to generate the fingerprints for.
    */
    devices?: DeviceCategory[];
    /**
    * List of at most 10 languages to include in the
    *  [Accept-Language](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language) request header
    *  in the language format accepted by that header, for example `en`, `en-US` or `de`.
    */
    locales?: string[];
    /**
    * Http version to be used to generate headers (the headers differ depending on the version).
    *
    * Can be either 1 or 2. Default value is 2.
    */
    httpVersion?: HttpVersion;
    /**
     * Defines the screen dimensions of the generated fingerprint.
     *
     * > Note: Using this option can lead to a substantial performance drop (from ~0.0007s/fingerprint to ~0.03s/fingerprint)
     */
    screen?: {
        minWidth?: number;
        maxWidth?: number;
        minHeight?: number;
        maxHeight?: number;
    };
}
declare const SUPPORTED_HTTP_VERSIONS: readonly ["1", "2"];
/**
 * String specifying the HTTP version to use.
 */
type HttpVersion = typeof SUPPORTED_HTTP_VERSIONS[number];
export declare const enum BrowserName {
    chrome = "chrome",
    firefox = "firefox",
    safari = "safari",
    edge = "edge"
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
export declare const enum OperatingSystemsName {
    linux = "linux",
    macos = "macos",
    windows = "windows",
    /**
     * `android` is (mostly) a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    android = "android",
    /**
     * `ios` is a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    ios = "ios"
}
export declare const enum DeviceCategory {
    /**
     * Describes mobile devices (mobile phones, tablets...). These devices usually have smaller, vertical screens and load lighter versions of websites.
     * > Note: Generating `android` and `ios` devices will not work without setting the device to `mobile` first.
     */
    mobile = "mobile",
    /**
     * Describes desktop computers and laptops. These devices usually have larger, horizontal screens and load full-sized versions of websites.
     */
    desktop = "desktop"
}
export {};
//# sourceMappingURL=types.d.ts.map
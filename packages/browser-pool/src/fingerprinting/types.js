const SUPPORTED_HTTP_VERSIONS = ['1', '2'];
export var BrowserName;
(function (BrowserName) {
    BrowserName["chrome"] = "chrome";
    BrowserName["firefox"] = "firefox";
    BrowserName["safari"] = "safari";
    BrowserName["edge"] = "edge";
})(BrowserName || (BrowserName = {}));
export var OperatingSystemsName;
(function (OperatingSystemsName) {
    OperatingSystemsName["linux"] = "linux";
    OperatingSystemsName["macos"] = "macos";
    OperatingSystemsName["windows"] = "windows";
    /**
     * `android` is (mostly) a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    OperatingSystemsName["android"] = "android";
    /**
     * `ios` is a mobile operating system. You can use this option only together with the `mobile` device category.
     */
    OperatingSystemsName["ios"] = "ios";
})(OperatingSystemsName || (OperatingSystemsName = {}));
export var DeviceCategory;
(function (DeviceCategory) {
    /**
     * Describes mobile devices (mobile phones, tablets...). These devices usually have smaller, vertical screens and load lighter versions of websites.
     * > Note: Generating `android` and `ios` devices will not work without setting the device to `mobile` first.
     */
    DeviceCategory["mobile"] = "mobile";
    /**
     * Describes desktop computers and laptops. These devices usually have larger, horizontal screens and load full-sized versions of websites.
     */
    DeviceCategory["desktop"] = "desktop";
})(DeviceCategory || (DeviceCategory = {}));

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeneratorDefaultOptions = void 0;
const puppeteer_plugin_1 = require("../puppeteer/puppeteer-plugin");
const playwright_plugin_1 = require("../playwright/playwright-plugin");
const getGeneratorDefaultOptions = (launchContext) => {
    const { browserPlugin, launchOptions } = launchContext;
    const options = {
        devices: ["desktop" /* DeviceCategory.desktop */],
        locales: ['en-US'],
        browsers: [getBrowserName(browserPlugin, launchOptions)],
        operatingSystems: [getOperatingSystem()],
    };
    return options;
};
exports.getGeneratorDefaultOptions = getGeneratorDefaultOptions;
const getBrowserName = (browserPlugin, launchOptions) => {
    const { library } = browserPlugin;
    let browserName;
    if (browserPlugin instanceof playwright_plugin_1.PlaywrightPlugin) {
        browserName = library.name();
    }
    if (browserPlugin instanceof puppeteer_plugin_1.PuppeteerPlugin) {
        browserName = launchOptions.product || library.product;
    }
    switch (browserName) {
        case 'webkit':
            return "safari" /* BrowserName.safari */;
        case 'firefox':
            return "firefox" /* BrowserName.firefox */;
        default:
            return "chrome" /* BrowserName.chrome */;
    }
};
const getOperatingSystem = () => {
    const { platform } = process;
    switch (platform) {
        case 'win32':
            // platform is win32 even for 64-bit
            return "windows" /* OperatingSystemsName.windows */;
        case 'darwin':
            return "macos" /* OperatingSystemsName.macos */;
        default:
            // consider everything else a linux
            return "linux" /* OperatingSystemsName.linux */;
    }
};
//# sourceMappingURL=utils.js.map
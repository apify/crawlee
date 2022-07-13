import { PuppeteerPlugin } from '../puppeteer/puppeteer-plugin';
import { PlaywrightPlugin } from '../playwright/playwright-plugin';
import type { BrowserPlugin } from '../abstract-classes/browser-plugin';
import type { LaunchContext } from '../launch-context';
import type { FingerprintGeneratorOptions } from './types';
import { BrowserName, DeviceCategory, OperatingSystemsName } from './types';

export const getGeneratorDefaultOptions = (launchContext: LaunchContext): FingerprintGeneratorOptions => {
    const { browserPlugin, launchOptions } = launchContext;

    const options = {
        devices: [DeviceCategory.desktop],
        locales: ['en-US'],
        browsers: [getBrowserName(browserPlugin, launchOptions)],
        operatingSystems: [getOperatingSystem()],
    };

    return options;
};

const getBrowserName = (browserPlugin: BrowserPlugin, launchOptions: any): BrowserName => {
    const { library } = browserPlugin;
    let browserName;

    if (browserPlugin instanceof PlaywrightPlugin) {
        browserName = library.name!();
    } if (browserPlugin instanceof PuppeteerPlugin) {
        browserName = launchOptions.product || library.product;
    }

    switch (browserName) {
        case 'webkit':
            return BrowserName.safari;
        case 'firefox':
            return BrowserName.firefox;
        default:
            return BrowserName.chrome;
    }
};

const getOperatingSystem = (): OperatingSystemsName => {
    const { platform } = process;

    switch (platform) {
        case 'win32':
            // platform is win32 even for 64-bit
            return OperatingSystemsName.windows;
        case 'darwin':
            return OperatingSystemsName.macos;
        default:
            // consider everything else a linux
            return OperatingSystemsName.linux;
    }
};

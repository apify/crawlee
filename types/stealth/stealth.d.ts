/**
 *  The main purpose of this function is to override newPage function and attach selected tricks.
 * @param {Browser} browser - puppeteer browser instance
 * @param {StealthOptions} options
 * @returns {Promise<Browser>} - Instance of Browser from puppeteer package
 */
export default function applyStealthToBrowser(browser: Browser, options: StealthOptions): Promise<Browser>;
/**
 * Configuration of stealth tricks for a proper hiding effect all of them should be set to true.
 * These tricks are applied only when the `stealth` option is set to `true`.
 */
export type StealthOptions = {
    /**
     * - If plugins should be added to the navigator.
     */
    addPlugins?: boolean;
    /**
     * - Emulates window Iframe.
     */
    emulateWindowFrame?: boolean;
    /**
     * - Emulates graphic card.
     */
    emulateWebGL?: boolean;
    /**
     * - Emulates console.debug to return null.
     */
    emulateConsoleDebug?: boolean;
    /**
     * - Adds languages to the navigator.
     */
    addLanguage?: boolean;
    /**
     * - Hides the webdriver by changing the navigator proto.
     */
    hideWebDriver?: boolean;
    /**
     * - Fakes interaction with permissions.
     */
    hackPermissions?: boolean;
    /**
     * - Adds the chrome runtime properties.
     */
    mockChrome?: boolean;
    /**
     * - Adds the chrome runtime properties inside the every newly created iframe.
     */
    mockChromeInIframe?: boolean;
    /**
     * - Sets device memory to other value than 0.
     */
    mockDeviceMemory?: boolean;
};
import { Browser } from "puppeteer";

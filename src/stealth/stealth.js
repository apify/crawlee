import _ from 'underscore';
import { Browser } from 'puppeteer'; // eslint-disable-line no-unused-vars
import hidingTricks from './hiding_tricks';

/**
 * Configuration of stealth tricks for a proper hiding effect all of them should be set to true.
 * These tricks are applied only when the `stealth` option is set to `true`.
 * @typedef {Object} StealthOptions
 * @property {boolean} [addPlugins=true] - If plugins should be added to the navigator.
 * @property {boolean} [emulateWindowFrame=true] - Emulates window Iframe.
 * @property {boolean} [emulateWebGL=true] - Emulates graphic card.
 * @property {boolean} [emulateConsoleDebug=true] - Emulates console.debug to return null.
 * @property {boolean} [addLanguage=true] - Adds languages to the navigator.
 * @property {boolean} [hideWebDriver=true] - Hides the webdriver by changing the navigator proto.
 * @property {boolean} [hackPermissions=true] - Fakes interaction with permissions.
 * @property {boolean} [mockChrome=true] - Adds the chrome runtime properties.
 * @property {boolean} [mockChromeInIframe=true] - Adds the chrome runtime properties inside the every newly created iframe.
 * @property {boolean} [mockDeviceMemory=true] - Sets device memory to other value than 0.
 */

const DEFAULT_STEALTH_OPTIONS = {
    addPlugins: true,
    emulateWindowFrame: true,
    emulateWebGL: true,
    emulateConsoleDebug: true,
    addLanguage: true,
    hideWebDriver: true,
    hackPermissions: true,
    mockChrome: true,
    mockChromeInIframe: true,
    mockDeviceMemory: true,
};

/**
 *  The main purpose of this function is to override newPage function and attach selected tricks.
 * @param {Browser} browser - puppeteer browser instance
 * @param {StealthOptions} options
 * @returns {Promise<Browser>} - Instance of Browser from puppeteer package
 */

export default function applyStealthToBrowser(browser, options) {
    const modifiedBrowser = browser;
    const opts = _.defaults(options, DEFAULT_STEALTH_OPTIONS);

    const defaultContext = browser.defaultBrowserContext();
    const contextPrototype = Object.getPrototypeOf(defaultContext);

    const prevNewPage = contextPrototype.newPage;

    contextPrototype.newPage = async function (...args) {
        const page = await prevNewPage.bind(this)(...args);
        await applyStealthTricks(page, opts);
        return page;
    };


    return Promise.resolve(modifiedBrowser);
}

/**
 * Applies stealth tricks to the puppeteer page
 * @param {Page} page
 * @param {StealthOptions} options
 * @returns {Promise}
 * @private
 * @ignore
 */

function applyStealthTricks(page, options) {
    const functions = Object.keys(options)
        .filter((key) => {
            return options[key];
        })
        .map(key => hidingTricks[key].toString());

    /* istanbul ignore next */
    const addFunctions = (functionsArr) => {
        for (const func of functionsArr) {
            eval(func)(); // eslint-disable-line
        }
    };

    return page.evaluateOnNewDocument(addFunctions, functions);
}

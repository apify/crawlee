import _ from 'underscore';
import hidingTricks from './hiding_tricks';

/**
 * Configuration of stealth tricks for a proper hiding effect all of them should be set to true
 * @typedef {Object} StealthOptions
 * @property {boolean} [addPlugins=false] - If plugins should be added to the navigator.
 * @property {boolean} [emulateWindowFrame=false] - Emulates window Iframe.
 * @property {boolean} [emulateWebGL=false] - Emulates graphic card.
 * @property {boolean} [emulateConsoleDebug=false] - Emulates console.debug to return null.
 * @property {boolean} [addLanguage=false] - Adds languages to the navigator.
 * @property {boolean} [hideWebDriver=false] - Hides the webdriver by changing the navigator proto.
 * @property {boolean} [hackPermissions=false] - Fakes interaction with permissions.
 * @property {boolean} [mockChrome=false] - Adds the chrome runtime properties.
 * @property {boolean} [mocksChromeInIframe=false] - Adds the chrome runtime properties inside the every newly created iframe.
 * @property {boolean} [mockDeviceMemory=false] - Sets device memory to other value than 0.
 */

const DEFAULT_STEALTH_OPTIONS = {
    addPlugins: false,
    emulateWindowFrame: false,
    emulateWebGL: false,
    emulateConsoleDebug: false,
    addLanguage: false,
    hideWebDriver: false,
    hackPermissions: false,
    mockChrome: false,
    mocksChromeInIframe: false,
    mockDeviceMemory: false,
};

/**
 *  The main purpose of this function is to override newPage function and attached selected tricks.
 * @param {Browser} browser - puppeteer browser instance
 * @param {StealthOptions} options
 * @returns {Promise<Browser>} - Instance of Browser from puppeteer package
 */

export default function applyStealthToBrowser(browser, options) {
    const modifiedBrowser = browser;
    const opts = _.defaults(options, DEFAULT_STEALTH_OPTIONS);

    const prevNewPage = browser.newPage;
    modifiedBrowser.newPage = async (...args) => {
        const page = await prevNewPage.bind(browser)(...args);
        await applyStealthTricks(page, opts);
        return Promise.resolve(page);
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

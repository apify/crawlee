import * as _ from 'underscore';
import { Page, Browser } from 'puppeteer'; // eslint-disable-line no-unused-vars
import globalLog from '../utils_log';

import hidingTricks from './hiding_tricks';

const log = globalLog.child({ prefix: 'Stealth' });

/**
 * Configuration of stealth tricks for a proper hiding effect all of them should be set to true.
 * These tricks are applied only when the `stealth` option is set to `true`.
 * @typedef StealthOptions
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

const STEALTH_ERROR_MESSAGE_PREFIX = 'StealthError';
const STEALTH_COUNTER_MESSAGE = 'Stealth evaluated!';
const MAX_IFRAMES = 10;

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

    const prevNewPage = defaultContext.newPage;

    defaultContext.newPage = async function (...args) {
        const page = await prevNewPage.bind(this)(...args);

        addStealthDebugToPage(page);
        await applyStealthTricks(page, opts);

        return page;
    };

    return Promise.resolve(modifiedBrowser);
}

/**
 * Logs the stealth errors in browser to the node stdout.
 * @param page {Page} - puppeteer page instance
 */
function addStealthDebugToPage(page) {
    let warningLogged = false;
    let counter = 1;
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes(STEALTH_ERROR_MESSAGE_PREFIX)) {
            log.error(text);
        } else if (text.includes(STEALTH_COUNTER_MESSAGE)) {
            if (counter > MAX_IFRAMES && !warningLogged) {
                log.warning(
                    `Evaluating hiding tricks in too many iframes (limit: ${MAX_IFRAMES}).`
                    + 'You might experience some performance issues. Try setting \'stealth\' false',
                );

                warningLogged = true;
            }
            counter++;
            log.info('Tricks evaluated', { counter });
        }
    });
}

/**
 * Applies stealth tricks to the puppeteer page
 * @param {Page} page
 * @param {StealthOptions} options
 * @returns {Promise<void>}
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
    const addFunctions = (functionsArr, errorMessagePrefix, counterMessage) => {
        console.log(counterMessage);
        // add functions
        for (const func of functionsArr) {
            try {
                eval(func)(); // eslint-disable-line
            } catch (e) {
                console.error(`${errorMessagePrefix}: Failed to apply stealth trick reason: ${e.message}`);
            }
        }
    };

    return page.evaluateOnNewDocument(addFunctions, functions, STEALTH_ERROR_MESSAGE_PREFIX, STEALTH_COUNTER_MESSAGE);
}

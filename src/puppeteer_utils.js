import fs from 'fs';
import path from 'path';
import Promise from 'bluebird';

const readFilePromised = Promise.promisify(fs.readFile);

/**
 * Hides certain Puppeteer fingerprints from the page, in order to help avoid detection of the crawler.
 * The function should be called on a newly-created page object before navigating to the target crawled page.
 *
 * @param page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const hideWebDriver = async (page) => {
    await page.evaluateOnNewDocument(() => {
        var modifiedNavigator; // eslint-disable-line no-var
        try {
            if (Navigator.prototype.hasOwnProperty('webdriver')) { // eslint-disable-line no-prototype-builtins
                modifiedNavigator = Navigator.prototype;
            } else {
                modifiedNavigator = Object.create(window.navigator);
                Object.defineProperty(window, 'navigator', {
                    value: modifiedNavigator,
                    configurable: false,
                    enumerable: true,
                    writable: false,
                });
            }
            Object.defineProperties(modifiedNavigator, {
                webdriver: {
                    configurable: true,
                    get: function () { // eslint-disable-line object-shorthand
                        return false;
                    },
                },
            });
            // Date.prototype.getTimezoneOffset = function () { return -4 * 60; };
        } catch (e) {
            console.error(e);
        }
    });
};


/**
 * Injects a JavaScript file into a Puppeteer page.
 * Unlike Puppeteer's `addScriptTag` function, this function works on pages
 * with arbitrary Cross-Origin Resource Sharing (CORS) policies.
 *
 * @param page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @param filePath File path
 * @return {Promise}
 */
const injectFile = async (page, filePath) => {
    const contents = await readFilePromised(filePath, 'utf8');

    return page.evaluate(contents);
};


/**
 * Injects [jQuery](https://jquery.com/) library into a Puppeteer page.
 * jQuery is often useful for various web scraping and crawling tasks,
 * e.g. to extract data from HTML elements using CSS selectors.
 *
 * Beware that the injected jQuery object will be set to the `window.$` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable (e.g. another version of jQuery).
 *
 * @param page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const injectJQuery = (page) => {
    const scriptPath = path.resolve(path.join(__dirname, '../node_modules/jquery/dist/jquery.min.js'));
    return injectFile(page, scriptPath);
};


/**
 * Injects [Underscore.js](https://underscorejs.org/) library into a Puppeteer page.
 * Beware that the injected Underscore object will be set to the `window._` variable and thus it might cause conflicts with
 * libraries included by the page that use the same variable.
 *
 * @param page Puppeteer [Page](https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-page) object.
 * @return {Promise}
 * @memberof utils.puppeteer
 */
const injectUnderscore = (page) => {
    const scriptPath = path.resolve(path.join(__dirname, '../node_modules/underscore/underscore-min.js'));
    return injectFile(page, scriptPath);
};


/**
 * A namespace that contains various Puppeteer utilities.
 *
 * Example usage:
 * ```javascript
 * const Apify = require('apify');
 *
 * // Open https://www.example.com in Puppeteer
 * const browser = await Apify.launchPuppeteer();
 * const page = await browser.newPage();
 * await page.goto('https://www.example.com');
 *
 * // Inject jQuery into a page
 * await Apify.utils.puppeteer.injectJQueryScript(page);
 * ```
 * @namespace utils.puppeteer
 * @name utils.puppeteer
 */
export const puppeteerUtils = {
    hideWebDriver,
    injectFile,
    injectJQuery,
    injectUnderscore,
};

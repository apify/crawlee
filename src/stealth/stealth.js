import hidingTricks from './hiding_tricks';

/**
 * Class that handles hiding headless chrome.
 * The main purpose of this class is to override newPage function and attached selected tricks.
 */
class Stealth {
    /**
     * constructor
     * @param {Object} options
     * @param {boolean} options.
     */
    constructor(options) {
        this.options = Object.assign({}, options);
    }

    /**
     *  Modifies the newPage function in order to get.
     * @param {Browser} browser - puppeteer browser instance
     * @returns {Promise<Browser>} - Instance of Browser from puppeteer package
     */
    getStealthBrowser(browser) {
        const modifiedBrowser = browser;

        const prevNewPage = browser.newPage;
        modifiedBrowser.newPage = async (...args) => {
            const page = await prevNewPage.bind(browser)(...args);
            await this._applyStealthTricks(page);
            return Promise.resolve(page);
        };


        return Promise.resolve(modifiedBrowser);
    }

    /**
     * Applies stealth tricks to the puppeteer page
     * @param {Page} page
     * @returns {Promise}
     * @private
     * @ignore
     */
    _applyStealthTricks(page) {
        const functions = Object.keys(this.options)
            .filter((key) => {
                return this.options[key];
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
}
export default Stealth;

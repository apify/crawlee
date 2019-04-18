import hidingTricks from './hiding_tricks';

/**
     *  The main purpose of this function is to override newPage function and attached selected tricks.
     * @param {Browser} browser - puppeteer browser instance
     * @returns {Promise<Browser>} - Instance of Browser from puppeteer package
     */
export default function applyStealthToBrowser(browser, options) {
    const modifiedBrowser = browser;

    const prevNewPage = browser.newPage;
    modifiedBrowser.newPage = async (...args) => {
        const page = await prevNewPage.bind(browser)(...args);
        await applyStealthTricks(page, options);
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

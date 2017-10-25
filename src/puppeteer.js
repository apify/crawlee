import { checkParamOrThrow } from 'apify-client/build/utils';
import { parseUrl } from './utils';
import { ENV_VARS } from './constants';

/* global process, require */

/**
 * Gets the default options for the browse() function, generated from current process environment
 * variables. This is function to enable unit testing.
 * @ignore
 */
export const getDefaultPuppeteerOptions = () => ({
    args: ['--no-sandbox'],
    headless: !!process.env[ENV_VARS.HEADLESS],
    proxyUrl: null,
});

/**
 * @memberof module:Apify
 * @function
 * @description Launches headless Chrome using Puppeteer pre-configured to work with the Apify Actor platform.
 * The result of the function is the same as result of `puppeteer.launch()`.
 * See https://github.com/GoogleChrome/puppeteer for more details.
 * @param options Optional settings, their defaults are provided in the getDefaultPuppeteerOptions function.
 * @return Returns a promise.
 */
export const launchPuppeteer = (opts = {}) => {
    let puppeteer;

    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        puppeteer = require('puppeteer'); // eslint-disable-line global-require
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') err.message = 'Cannot find module \'puppeteer\'. Did you choose the wrong docker image?';

        throw err;
    }

    checkParamOrThrow(opts, 'opts', 'Object');

    const { proxyUrl } = opts;

    if (proxyUrl) {
        checkParamOrThrow(proxyUrl, 'opts.proxyUrl', 'String');

        const { host, port, protocol, password } = parseUrl(proxyUrl);
        if (!host || !port) throw new Error('Invalid "proxyUrl" option: the URL must contain hostname and port number.');
        if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Invalid "proxyUrl" option: protocol must be http or https.');
        if (password) throw new Error('Invalid "proxyUrl" option: password is not currently supported.');

        const proxyVarName = proxyUrl.startsWith('https') ? 'HTTPS_PROXY' : 'HTTP_PROXY';
        opts.env = opts.env || {};
        opts.env[proxyVarName] = opts.proxyUrl;
    }

    return puppeteer.launch(Object.assign({}, getDefaultPuppeteerOptions(), opts));
};

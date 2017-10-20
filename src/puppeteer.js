import puppeteer from 'puppeteer';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { parseUrl } from './utils';
import { ENV_VARS } from './constants';

export const PUPPETEER_DEFAULT_OPTS = {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: !!process.env[ENV_VARS.HEADLESS],
    proxyUrl: null,
};

/**
 * @memberof module:Apify
 * @function
 * @description Launches Puppeteer preconfigured to work with Apify platform.
 * The result of the function is a result of puppeteer.launch().
 * @param options Optional settings, their defaults are provided in the PUPPETEER_DEFAULT_OPTS constant.
 * @return Returns a promise.
 */
export const launchPuppeteer = (opts = {}) => {
    checkParamOrThrow(opts, 'opts', 'Object');

    const { proxyUrl } = opts;

    if (proxyUrl) {
        checkParamOrThrow(proxyUrl, 'opts.proxyUrl', 'String');

        const { host, port, protocol } = parseUrl(proxyUrl);
        if (!host || !port) throw new Error('Invalid "proxyUrl" option: the URL must contain hostname and port number.');
        if (protocol !== 'http:' && protocol !== 'https:') throw new Error('Invalid "proxyUrl" option: protocol must be http or https.');

        const proxyVarName = proxyUrl.startsWith('https') ? 'HTTPS_PROXY' : 'HTTP_PROXY';
        opts.env = opts.env || {};
        opts.env[proxyVarName] = opts.proxyUrl;
    }

    return puppeteer.launch(Object.assign({}, PUPPETEER_DEFAULT_OPTS, opts));
};

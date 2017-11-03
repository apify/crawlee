import { checkParamOrThrow } from 'apify-client/build/utils';
import { parseUrl } from './utils';
import { ENV_VARS } from './constants';

/* global process, require */


/**
 * @memberof module:Apify
 * @function
 * @description <p>Launches headless Chrome using Puppeteer pre-configured to work with the Apify Actor platform.
 * The function has the same argument and return value as `puppeteer.launch()`.
 * See {@link https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions|Puppeteer documentation} for more details.
 * </p>
 * <p>The `launchPuppeteer()` function alters the following Puppeteer options:
 * <ul>
 *    <li>Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *        unless it was already defined by the caller. Note that this environment variable is automatically set to `1`
 *        in acts running on the Apify Actor cloud platform.</li>
 *    <li>Takes the `proxyUrl` option and adds it to `env` under the `HTTPS_PROXY` or `HTTP_PROXY` key.</li>
 *    <li>Adds `--no-sandbox` to `args` to enable running headless Chrome in a Docker container on the Actor platform.</li>
 * </ul>
 * </p>
 * <p>
 * To use this function, you need to have the
 * {@link https://www.npmjs.com/package/puppeteer|puppeteer}
 * NPM package installed in your project.
 * For example, you can use the `apify/actor-node-puppeteer` base Docker image for your act - see
 * {@link https://www.apify.com/docs/actor#base-images|documentation}
 * for more details.
 * </p>
 * @param {Object} [opts] Optional settings passed to `puppeteer.launch()`. Additionally the object can contain the following fields:
 * @param {String} [opts.proxyUrl] - URL to a proxy server. Currently only `http://` scheme is supported.
 * Port number must be specified. Proxy authentication is not supported yet. For example, `http://example.com:1234`.
 * @param {String} [opts.userAgent] - Default User-Agent for the browser.
 * @returns {Promise} Promise object returned by `puppeteer.launch()`
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
    checkParamOrThrow(opts.env, 'opts.env', 'Maybe Object');
    checkParamOrThrow(opts.args, 'opts.args', 'Maybe [String]');

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

    opts.args = opts.args || [];
    opts.args.push('--no-sandbox');

    if (opts.userAgent) opts.args.push(`--user-agent=${opts.userAgent}`);
    if (opts.headless === undefined || opts.headless === null) opts.headless = process.env[ENV_VARS.HEADLESS] === '1';

    return puppeteer.launch(opts);
};

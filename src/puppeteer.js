import { checkParamOrThrow } from 'apify-client/build/utils';
import { anonymizeProxy, closeAnonymizedProxy } from 'proxy-chain';
import { ENV_VARS, DEFAULT_USER_AGENT } from './constants';
import { newPromise, getTypicalChromeExecutablePath } from './utils';

/* global process, require */

/**
 * Launches headless Chrome using Puppeteer pre-configured to work with the Apify Actor platform.
 * The function has the same argument and return value as `puppeteer.launch()`.
 * See <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
 * Puppeteer documentation</a> for more details.
 *
 * The `launchPuppeteer()` function alters the following Puppeteer options:
 *
 * <ul>
 *    <li>Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *        unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *        Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running acts.</li>
 *    <li>Takes the `proxyUrl` option, checks it and adds it to `args` as `--proxy-server=XXX`.
 *        If the proxy uses authentication, the function sets up an anonymous proxy HTTP
 *        to make the proxy work with headless Chrome. For more information, read the
 *        <a href="https://blog.apify.com/249a21a79212" target="_blank">blog post about proxy-chain library</a>.
 *    </li>
 *    <li>Adds `--no-sandbox` to `args` to enable running headless Chrome in a Docker container on the Apify Actor platform.</li>
 * </ul>
 *
 * To use this function, you need to have the <a href="https://www.npmjs.com/package/puppeteer" target="_blank">puppeteer</a>
 * NPM package installed in your project.
 * For example, you can use the `apify/actor-node-chrome` base Docker image for your act - see
 * <a href="https://www.apify.com/docs/actor#base-images" target="_blank">documentation</a>
 * for more details.
 *
 * For an example of usage, see the <a href="https://www.apify.com/apify/example-puppeteer">apify/example-puppeteer</a> act.
 *
 * @param {Object} [opts] Optional settings passed to `puppeteer.launch()`. Additionally the object can contain the following fields:
 * @param {String} [opts.proxyUrl] URL to a HTTP proxy server.
 *                                 Port number must be specified. Proxy username and password might also be provided.
 *                                 For example, `http://bob:pass123@proxy.example.com:1234`.
 * @param {String} [opts.userAgent] Default User-Agent for the browser.
 *                                  If not provided, the function sets it to a reasonable default.
 * @param {String} [opts.useChrome=false] If true-ish value and `opts.executablePath` is not set,
 *                                  Puppeteer will launch full Chrome available on the machine rather than the bundled Chromium.
 *                                  The path to Chrome executable is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *                                  or defaults to the typical Google Chrome executable location specific for the operating system.
 *                                  By default, this option is `false`.
 * @returns {Promise} Promise object that resolves to Puppeteer's `Browser` instance.
 *
 * @memberof module:Apify
 * @name launchPuppeteer
 * @instance
 * @function
 */
export const launchPuppeteer = (opts) => {
    if (opts === undefined || opts === null) opts = {};

    checkParamOrThrow(opts, 'opts', 'Object');
    checkParamOrThrow(opts.args, 'opts.args', 'Maybe [String]');
    checkParamOrThrow(opts.proxyUrl, 'opts.proxyUrl', 'Maybe String');

    let puppeteer;
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        puppeteer = require('puppeteer'); // eslint-disable-line global-require
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') err.message = 'Cannot find module \'puppeteer\'. Did you choose the correct base Docker image?';

        throw err;
    }

    opts.args = opts.args || [];
    opts.args.push('--no-sandbox');
    opts.args.push(`--user-agent=${opts.userAgent || DEFAULT_USER_AGENT}`);
    if (opts.headless === undefined || opts.headless === null) {
        opts.headless = process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
    }
    if (opts.useChrome && (opts.executablePath === undefined || opts.executablePath === null)) {
        opts.executablePath = process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }

    let anonymizedProxyUrl;
    let promise;

    // Parse and validate proxy URL and anonymize it
    if (opts.proxyUrl) {
        // NOTE: anonymizeProxy() throws on invalid proxy URL, so it must not be inside a Promise!
        promise = anonymizeProxy(opts.proxyUrl)
            .then((result) => {
                anonymizedProxyUrl = result;
                opts.args.push(`--proxy-server=${anonymizedProxyUrl}`);
            })
            .then(() => puppeteer.launch(opts));
    } else {
        promise = puppeteer.launch(opts);
    }

    // Close anonymization proxy server when Puppeteer finishes
    if (opts.proxyUrl) {
        promise = promise.then((browser) => {
            const cleanUp = () => {
                // Don't wait for finish, only log errors
                closeAnonymizedProxy(anonymizedProxyUrl, true)
                    .catch((err) => {
                        console.log(`WARNING: closeAnonymizedProxy() failed with: ${err.stack || err}`);
                    });
            };

            browser.on('disconnected', cleanUp);

            const prevClose = browser.close.bind(browser);
            browser.close = () => {
                cleanUp();
                return prevClose();
            };

            return browser;
        });
    }

    // Ensure that the returned promise is of type set in setPromiseDependency()
    return newPromise().then(() => promise);
};

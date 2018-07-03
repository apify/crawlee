import _ from 'underscore';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { anonymizeProxy, closeAnonymizedProxy, redactUrl } from 'proxy-chain';
import log from 'apify-shared/log';
import { ENV_VARS, DEFAULT_USER_AGENT } from './constants';
import { newPromise, getTypicalChromeExecutablePath } from './utils';
import { getApifyProxyUrl } from './actor';
import { registerBrowserForLiveView } from './puppeteer_live_view_server';

/* global process, require */


const LAUNCH_PUPPETEER_LOG_OMIT_OPTS = [
    'proxyUrl', 'userAgent', 'useApifyProxy', 'apifyProxySession', 'apifyProxyGroups',
];

/**
 * @typedef {Object} LaunchPuppeteerOptions
 * @property {String} [opts.proxyUrl] URL to a HTTP proxy server. It must define the port number,
 *                                 and it might also contain proxy username and password.
 *                                 For example: `http://bob:pass123@proxy.example.com:1234`.
 * @property {String} [opts.userAgent] HTTP `User-Agent` header used by the browser.
 *                                  If not provided, the function sets `User-Agent` to a reasonable default
 *                                  to reduce the chance of detection of the crawler.
 * @property {Boolean} [opts.useChrome=false] If `true` and `opts.executablePath` is not set,
 *                                  Puppeteer will launch full Google Chrome browser available on the machine
 *                                  rather than the bundled Chromium. The path to Chrome executable
 *                                  is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *                                  or defaults to the typical Google Chrome executable location specific for the operating system.
 *                                  By default, this option is `false`.
 * @property {Boolean} [opts.useApifyProxy=false] If set to `true`, Puppeteer will be configured to use
 * <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 * For more information, see the <a href="https://www.apify.com/docs/proxy">documentation</a>
 * @property {String[]} [opts.apifyProxyGroups] An array of proxy groups to be used
 * by the <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>.
 * Only applied if the `useApifyProxy` option is `true`.
 * @property {String} [opts.apifyProxySession] Apify Proxy session identifier to be used by all the Chrome browsers.
 * All HTTP requests going through the proxy with the same session identifier
 * will use the same target proxy server (i.e. the same IP address).
 * The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 * Only applied if the `useApifyProxy` option is `true`.
 */

/**
 * Launches Puppeteer with proxy used via `proxy-chain` package.
 *
 * @ignore
 */
const launchPuppeteerWithProxy = (puppeteer, opts) => {
    let anonymizedProxyUrl;

    // Parse and validate proxy URL and anonymize it
    // NOTE: anonymizeProxy() throws on invalid proxy URL, so it must not be inside a Promise!
    return anonymizeProxy(opts.proxyUrl)
        .then((result) => {
            anonymizedProxyUrl = result;
            opts.args.push(`--proxy-server=${anonymizedProxyUrl}`);
        })
        .then(() => {
            const optsForLog = _.omit(opts, LAUNCH_PUPPETEER_LOG_OMIT_OPTS);
            optsForLog.proxyUrl = redactUrl(opts.proxyUrl);
            optsForLog.args = opts.args.slice(0, opts.args.length - 1);
            log.info('Launching Puppeteer', optsForLog);

            return puppeteer.launch(opts);
        })
        // Close anonymization proxy server when Puppeteer finishes
        .then((browser) => {
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
};

/**
 * Requires `puppeteer` package or throws meaningful error if not installed.
 *
 * @ignore
 */
const getPuppeteerOrThrow = () => {
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        return require('puppeteer'); // eslint-disable-line global-require
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') err.message = 'Cannot find module \'puppeteer\'. Did you choose the correct base Docker image?';

        throw err;
    }
};

/**
 * Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform.
 * The function has the same argument and the return value as `puppeteer.launch()`.
 * See <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
 * Puppeteer documentation</a> for more details.
 *
 * The `launchPuppeteer()` function alters the following Puppeteer options:
 *
 * <ul>
 *    <li>
 *        Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *        unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *        Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running acts.
 *    </li>
 *    <li>
 *        Takes the `proxyUrl` option, checks it and adds it to `args` as `--proxy-server=XXX`.
 *        If the proxy uses authentication, the function sets up an anonymous proxy HTTP
 *        to make the proxy work with headless Chrome. For more information, read the
 *        <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
 *        target="_blank">blog post about proxy-chain library</a>.
 *    </li>
 *    <li>
 *        If `opts.useApifyProxy` is `true` then the function generates a URL of
 *        <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>
 *        based on `opts.apifyProxyGroups` and `opts.apifyProxySession` and passes it as `opts.proxyUrl`.
 *    </li>
 *    <li>
 *        The function adds `--no-sandbox` to `args` to enable running headless Chrome in a Docker container on the Apify platform.
 *    </li>
 * </ul>
 *
 * To use this function, you need to have the <a href="https://www.npmjs.com/package/puppeteer" target="_blank">puppeteer</a>
 * NPM package installed in your project.
 * When running on the Apify cloud platform, you can achieve that simply
 * by using the `apify/actor-node-chrome` base Docker image for your act - see
 * <a href="https://www.apify.com/docs/actor#base-images" target="_blank">Apify Actor documentation</a>
 * for details.
 *
 * For an example of usage, see the <a href="https://www.apify.com/apify/example-puppeteer">apify/example-puppeteer</a> actor.
 *
 * @param {LaunchPuppeteerOptions} [opts]
 *   Optional settings passed to `puppeteer.launch()`. Additionally the object can
 *   contain the following fields:
 * @returns {Promise}
 *   Promise object that resolves to Puppeteer's `Browser` instance.
 * @memberof module:Apify
 * @name launchPuppeteer
 * @instance
 * @function
 */
export const launchPuppeteer = (opts = {}) => {
    checkParamOrThrow(opts, 'opts', 'Object');
    checkParamOrThrow(opts.args, 'opts.args', 'Maybe [String]');
    checkParamOrThrow(opts.proxyUrl, 'opts.proxyUrl', 'Maybe String');
    checkParamOrThrow(opts.useApifyProxy, 'opts.useApifyProxy', 'Maybe Boolean');
    if (opts.useApifyProxy && opts.proxyUrl) throw new Error('Cannot combine "opts.useApifyProxy" with "opts.proxyUrl"!');

    const puppeteer = getPuppeteerOrThrow();
    const optsCopy = Object.assign({}, opts);

    optsCopy.args = optsCopy.args || [];
    optsCopy.args.push('--no-sandbox');
    if (optsCopy.headless == null) {
        // forcing headless with liveView, otherwise screenshots redirect user to new browser window
        optsCopy.headless = optsCopy.liveView || (process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1');
    }
    if (optsCopy.useChrome && (optsCopy.executablePath === undefined || optsCopy.executablePath === null)) {
        optsCopy.executablePath = process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }
    if (optsCopy.useApifyProxy) {
        const { apifyProxyGroups, apifyProxySession } = optsCopy;

        optsCopy.proxyUrl = getApifyProxyUrl({ apifyProxyGroups, apifyProxySession });
    }

    // When User-Agent is not set and we're using Chromium or headless mode,
    // it is better to use DEFAULT_USER_AGENT to reduce chance of detection
    let { userAgent } = optsCopy;
    if (!userAgent && (!optsCopy.executablePath || optsCopy.headless)) {
        userAgent = DEFAULT_USER_AGENT;
    }
    if (userAgent) {
        optsCopy.args.push(`--user-agent=${userAgent}`);
    }

    let browserPromise;
    if (optsCopy.proxyUrl) {
        browserPromise = launchPuppeteerWithProxy(puppeteer, optsCopy);
    } else {
        log.info('Launching Puppeteer', _.omit(optsCopy, LAUNCH_PUPPETEER_LOG_OMIT_OPTS));
        browserPromise = puppeteer.launch(optsCopy);
    }

    // Ensure that the returned promise is of type Bluebird.
    const wrapped = newPromise().then(() => browserPromise);

    // start LiveView server if requested
    if (optsCopy.liveView) return registerBrowserForLiveView(wrapped, optsCopy.liveViewOptions).then(() => wrapped); // TODO document Options

    return wrapped;
};

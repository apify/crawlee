import ow from 'ow';
import * as _ from 'underscore';
import { anonymizeProxy, closeAnonymizedProxy, redactUrl, parseUrl } from 'proxy-chain';
import { ENV_VARS } from 'apify-shared/consts';
import { Browser } from 'puppeteer'; // eslint-disable-line no-unused-vars
import { DEFAULT_USER_AGENT } from './constants';
import log from './utils_log';
import { getTypicalChromeExecutablePath, isAtHome } from './utils';
import applyStealthToBrowser, { StealthOptions } from './stealth/stealth'; // eslint-disable-line no-unused-vars,import/named

const LAUNCH_PUPPETEER_LOG_OMIT_OPTS = [
    'proxyUrl', 'userAgent', 'puppeteerModule', 'stealthOptions',
];

const LAUNCH_PUPPETEER_DEFAULT_VIEWPORT = {
    width: 1366,
    height: 768,
};

const LAUNCH_PUPPETEER_APIFY_OPTIONS = [
    ...LAUNCH_PUPPETEER_LOG_OMIT_OPTS,
    'useChrome', 'stealth',
];

/**
 * Launches Puppeteer with proxy used via `proxy-chain` package.
 *
 * @ignore
 */
const launchPuppeteerWithProxy = async (puppeteer, opts) => {
    // Parse and validate proxy URL
    const parsedProxyUrl = parseUrl(opts.proxyUrl);
    if (!parsedProxyUrl.host || !parsedProxyUrl.port) {
        throw new Error('Invalid "proxyUrl" option: both hostname and port must be provided.');
    }
    if (!/^(http|https|socks4|socks5)$/.test(parsedProxyUrl.scheme)) {
        throw new Error(`Invalid "proxyUrl" option: Unsupported scheme (${parsedProxyUrl.scheme}).`);
    }

    // Anonymize proxy URL if it has username or password
    let anonymizedProxyUrl = null;
    if (parsedProxyUrl.username || parsedProxyUrl.password) {
        if (parsedProxyUrl.scheme !== 'http') {
            throw new Error('Invalid "proxyUrl" option: authentication is only supported for HTTP proxy type.');
        }
        anonymizedProxyUrl = await anonymizeProxy(opts.proxyUrl);
    }

    opts.args.push(`--proxy-server=${anonymizedProxyUrl || opts.proxyUrl}`);
    const optsForLog = _.omit(opts, LAUNCH_PUPPETEER_LOG_OMIT_OPTS);
    optsForLog.proxyUrl = redactUrl(opts.proxyUrl);
    optsForLog.args = opts.args.slice(0, opts.args.length - 1);

    log.info('Launching Puppeteer', optsForLog);
    const onlyPuppeteerOptions = _.omit(opts, LAUNCH_PUPPETEER_APIFY_OPTIONS);
    const browser = await puppeteer.launch(onlyPuppeteerOptions);

    // Close anonymization proxy server when Puppeteer finishes
    if (anonymizedProxyUrl) {
        const cleanUp = () => {
            // Don't wait for finish, only log errors
            closeAnonymizedProxy(anonymizedProxyUrl, true)
                .catch((err) => log.exception(err, 'closeAnonymizedProxy() failed.'));
        };

        browser.on('disconnected', cleanUp);

        const prevClose = browser.close.bind(browser);
        browser.close = () => {
            cleanUp();
            return prevClose();
        };
    }

    return browser;
};

/**
 * Requires `puppeteer` package, uses a replacement or throws meaningful error if not installed.
 *
 * @param {(string|Object)} puppeteerModule
 * @ignore
 */
const getPuppeteerOrThrow = (puppeteerModule = 'puppeteer') => {
    if (typeof puppeteerModule === 'object') return puppeteerModule;
    try {
        // This is an optional dependency because it is quite large, only require it when used (ie. image with Chrome)
        return require(puppeteerModule); // eslint-disable-line
    } catch (err) {
        if (err.code === 'MODULE_NOT_FOUND') {
            const msg = `Cannot find module '${puppeteerModule}'. Did you you install the '${puppeteerModule}' package?`;
            err.message = isAtHome()
                ? `${msg} The 'puppeteer' package is automatically bundled when using apify/actor-node-chrome-* Base image.`
                : msg;
        }

        throw err;
    }
};

// TODO yin: `@property ...` didn't work. Extend Puppeteer's `LaunchOptions` didn't work. There is a GitHub issue for that:
//  https://github.com/Microsoft/TypeScript/issues/20077
/**
 * Apify extends the launch options of Puppeteer.
 * You can use any of the Puppeteer compatible
 * [`LaunchOptions`](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 * options in the  {@link Apify#launchPuppeteer}
 * function and in addition, all the options available below.
 *
 * @typedef LaunchPuppeteerOptions
 * @property {string} [proxyUrl]
 *   URL to a HTTP proxy server. It must define the port number,
 *   and it may also contain proxy username and password.
 *
 *   Example: `http://bob:pass123@proxy.example.com:1234`.
 * @property {string} [userAgent]
 *   The `User-Agent` HTTP header used by the browser.
 *   If not provided, the function sets `User-Agent` to a reasonable default
 *   to reduce the chance of detection of the crawler.
 * @property {boolean} [useChrome=false]
 *   If `true` and `executablePath` is not set,
 *   Puppeteer will launch full Google Chrome browser available on the machine
 *   rather than the bundled Chromium. The path to Chrome executable
 *   is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *   or defaults to the typical Google Chrome executable location specific for the operating system.
 *   By default, this option is `false`.
 * @property {(string|Object)} [puppeteerModule]
 *   Either a require path (`string`) to a package to be used instead of default `puppeteer`,
 *   or an already required module (`Object`). This enables usage of various Puppeteer
 *   wrappers such as `puppeteer-extra`.
 *
 *   Take caution, because it can cause all kinds of unexpected errors and weird behavior.
 *   Apify SDK is not tested with any other library besides `puppeteer` itself.
 * @property {boolean} [stealth]
 *   This setting hides most of the known properties that identify headless Chrome and makes it nearly undetectable.
 *   It is recommended to use it together with the `useChrome` set to `true`.
 * @property {StealthOptions} [stealthOptions]
 *   Using this configuration, you can disable some of the hiding tricks.
 *   For these settings to take effect `stealth` must be set to true
 */

/**
 * Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform.
 * The function has the same argument and the return value as `puppeteer.launch()`.
 * See <a href="https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
 * Puppeteer documentation</a> for more details.
 *
 * The `launchPuppeteer()` function alters the following Puppeteer options:
 *
 * - Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `args` as `--proxy-server=XXX`.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPuppeteer` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
 *   target="_blank">blog post about proxy-chain library</a>.
 * - If `options.useApifyProxy` is `true` then the function generates a URL of
 *   [Apify Proxy](https://docs.apify.com/proxy)
 *   based on `options.apifyProxyGroups` and `options.apifyProxySession` and passes it as `options.proxyUrl`.
 * - The function adds `--no-sandbox` to `args` to enable running
 *   headless Chrome in a Docker container on the Apify platform.
 * - Sets `defaultViewport` Puppeteer option (if not already set)
 *   to a more reasonable default for screenshots and debugging.
 *   You can set `options.defaultViewport` to `null` if you prefer to let Puppeteer
 *   choose the default viewport size.
 *
 * To use this function, you need to have the [puppeteer](https://www.npmjs.com/package/puppeteer)
 * NPM package installed in your project.
 * When running on the Apify cloud, you can achieve that simply
 * by using the `apify/actor-node-chrome` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * For an example of usage, see the [Synchronous run Example](../examples/synchronous-run)
 * or the [Puppeteer proxy Example](../examples/puppeteer-with-proxy)
 *
 * @param {LaunchPuppeteerOptions} [options]
 *   Optional settings passed to `puppeteer.launch()`. In addition to
 *   [Puppeteer's options](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions)
 *   the object may contain our own  {@link LaunchPuppeteerOptions} that enable additional features.
 * @returns {Promise<Browser>}
 *   Promise that resolves to Puppeteer's `Browser` instance.
 * @memberof module:Apify
 * @name launchPuppeteer
 * @function
 */
export const launchPuppeteer = async (options = {}) => {
    ow(options, ow.object.partialShape({
        args: ow.optional.array.ofType(ow.string),
        proxyUrl: ow.optional.string.url,
        puppeteerModule: ow.optional.any(ow.string, ow.object),
        stealth: ow.optional.boolean,
        stealthOptions: ow.optional.object,
    }));

    const puppeteer = getPuppeteerOrThrow(options.puppeteerModule);

    const optsCopy = { ...options };

    optsCopy.args = optsCopy.args || [];
    optsCopy.args.push('--no-sandbox');
    if (optsCopy.headless == null) {
        optsCopy.headless = process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
    }
    if (optsCopy.useChrome && (optsCopy.executablePath === undefined || optsCopy.executablePath === null)) {
        optsCopy.executablePath = process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }

    if (optsCopy.defaultViewport === undefined) {
        optsCopy.defaultViewport = LAUNCH_PUPPETEER_DEFAULT_VIEWPORT;
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

    let browser;
    if (optsCopy.proxyUrl) {
        // The log for launching with proxyUrl is inside launchPuppeteerWithProxy
        browser = await launchPuppeteerWithProxy(puppeteer, optsCopy);
    } else {
        log.info('Launching Puppeteer', _.omit(optsCopy, LAUNCH_PUPPETEER_LOG_OMIT_OPTS));
        const onlyPuppeteerOptions = _.omit(optsCopy, LAUNCH_PUPPETEER_APIFY_OPTIONS);
        browser = await puppeteer.launch(onlyPuppeteerOptions);
    }

    // Add stealth
    if (optsCopy.stealth) {
        browser = applyStealthToBrowser(browser, optsCopy.stealthOptions);
    }

    return browser;
};

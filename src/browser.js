// import { ChromeLauncher } from 'lighthouse/lighthouse-cli/chrome-launcher';
import { APIFY_ENV_VARS } from './constants';
import { newPromise, nodeifyPromise, parseUrl } from './utils';
import { ProxyChain } from './proxy_chain';


/* global process, require */

// interesting resources:
// https://chromium.googlesource.com/chromium/src/+/master/docs/linux_debugging.md
// http://peter.sh/experiments/chromium-command-line-switches/#user-agent
// https://github.com/SeleniumHQ/selenium/tree/master/javascript/node/selenium-webdriver/example

// logging.installConsoleHandler();
// logging.getLogger('webdriver.http').setLevel(logging.Level.ALL);

// TODO: on first use of Apifier.browse(), print out the version of Chrome and ChromeDriver


/**
 * Gets the default options for the browse() function, generated from current process environment
 * variables. This is function to enable unit testing.
 */
export const getDefaultBrowseOptions = () => {
    return {
        headless: !!process.env[APIFY_ENV_VARS.HEADLESS],
        browserName: 'chrome',
        proxyUrl: null,
        userAgent: null,
    };
};


/**
 * Represents a single web browser process.
 * Currently it is just a thin wrapper of Selenium's WebDriver instance.
 */
export class Browser {

    constructor(options) {
        this.options = Object.assign(getDefaultBrowseOptions(), options);

        if (this.options.proxyUrl) {
            const parsed = parseUrl(this.options.proxyUrl);
            if (!parsed.host || !parsed.port) throw new Error('Invalid "proxyUrl" option: the URL must contain hostname and port number.');
            if (parsed.scheme !== 'http') throw new Error('Invalid "proxyUrl" option: only HTTP proxy type is currently supported.');
            this.parsedProxyUrl = parsed;
        }

        // This is an optional dependency because it is quite large, only require it when used
        const { Capabilities, Builder } = require('selenium-webdriver'); // eslint-disable-line global-require
        const chrome = require('selenium-webdriver/chrome'); // eslint-disable-line global-require

        // logging.installConsoleHandler();
        // logging.getLogger('webdriver.http').setLevel(logging.Level.ALL);

        // See https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities for reference.
        this.capabilities = new Capabilities();
        this.capabilities.set('browserName', this.options.browserName);

        // Chrome-specific options
        // By default, Selenium already defines a long list of command-line options
        // to enable browser automation, here we add a few other ones
        // (inspired by Lighthouse, see lighthouse/lighthouse-cli/chrome-launcher)
        this.chromeOptions = new chrome.Options();
        this.chromeOptions.addArguments('--disable-translate');
        this.chromeOptions.addArguments('--safebrowsing-disable-auto-update');
        if (this.options.headless) {
            this.chromeOptions.addArguments('--headless', '--disable-gpu', '--no-sandbox');
        }
        if (this.options.userAgent) {
            this.chromeOptions.addArguments(`--user-agent=${this.options.userAgent}`);
        }

        this.builder = new Builder();

        // Instance of Selenium's WebDriver
        this.webDriver = null;

        // Instance of ProxyChain or null if not used
        this.proxyChain = null;
    }

    /**
     * Initializes the browser.
     * @return Promise
     */
    _initialize() {
        return newPromise()
            .then(() => {
                return this._setupProxy();
            })
            .then(() => {
                this.webDriver = this.builder
                    .setChromeOptions(this.chromeOptions)
                    .withCapabilities(this.capabilities)
                    .build();
            })
            .then(() => {
                return this;
            });
    }

    /**
     * Applies options.proxyUrl setting to the WebDriver's Capabilities and Chrome Options.
     * For proxy servers with authentication, this class starts a local
     * Privoxy process to proxy-chain to the target proxy server and enable browser
     * no to use authentication, because it's typically not supported.
     * @param capabilities
     * @param chromeOpts
     */
    _setupProxy() {
        if (!this.parsedProxyUrl) return null;

        // NOTE: to view effective proxy settings in Chrome, open chrome://net-internals/#proxy
        // https://sites.google.com/a/chromium.org/chromedriver/capabilities
        // https://github.com/haad/proxychains/blob/0f61bd071389398a4c8378847a45973577593e6f/src/proxychains.conf
        // https://www.rootusers.com/configure-squid-proxy-to-forward-to-a-parent-proxy/
        // https://gist.github.com/leefsmp/3e4385e08ea27e30ba96
        // https://github.com/tinyproxy/tinyproxy

        return newPromise().then(() => {
            // If target proxy has no authentication, pass it directly to the browser.
            if (!this.parsedProxyUrl.auth) {
                return this.parsedProxyUrl;
            }

            // Otherwise we need to setup an open child proxy
            // that will forward to the original proxy with authentication
            this.proxyChain = new ProxyChain(this.parsedProxyUrl);
            return this.proxyChain.start();
        })
        .then((effectiveParsedProxyUrl) => {
            if (/^chrome$/i.test(this.options.browserName)) {
                // In Chrome Capabilities.setProxy() has no effect,
                // so we setup the proxy manually
                this.chromeOptions.addArguments(`--proxy-server=${effectiveParsedProxyUrl.host}`);
            } else {
                const proxyConfig = {
                    proxyType: 'MANUAL',
                    httpProxy: effectiveParsedProxyUrl.host,
                    sslProxy: effectiveParsedProxyUrl.host,
                    ftpProxy: effectiveParsedProxyUrl.host,
                    // socksProxy: this.parsedProxyUrl.host,
                    //socksUsername: parsed.username,
                    //socksPassword: parsed.password,
                    // noProxy: '', // Do not skip proxy for any address
                };
                this.capabilities.setProxy(proxyConfig);

                console.dir(this.capabilities);
            }
        });
    }

    close() {
        if (this.proxyChain) {
            this.proxyChain.shutdown();
            this.proxyChain = null;
        }

        return newPromise()
            .then(() => {
                if (this.webDriver) {
                    return this.webDriver.quit();
                }
            })
            .then(() => {
                this.parsedChildProxyUrl = null;
                this.webDriver = null;
            });
    }
}

/**
 * Normalizes arguments for Apifier.browse(), fills correctly default values.
 * The function is exported to allow unit testing.
 * @param url Optional string
 * @param options Optional object
 * @param callback Optional function
 */
export const processBrowseArgs = (url, options, callback) => {
    if (typeof (url) === 'object' || typeof (url) === 'function') {
        callback = options;
        options = url;
        url = null;
    }
    if (typeof (options) === 'function') {
        callback = options;
        options = null;
    }
    options = Object.assign({}, options);
    options.url = url || options.url || 'about:blank';
    callback = callback || null;

    if (typeof (options.url) !== 'string') throw new Error('Invalid "url" provided.');
    if (callback && typeof (callback) !== 'function') throw new Error('Invalid "callback" provided.');

    return { options, callback };
};


/**
 * Opens a new web browser, which is attached to Apifier debugger so that snapshots are sent to Run console (TODO).
 * Internally, this function calls Selenium WebDrivers's Builder command to create a new WebDriver instance.
 * (see http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_Builder.html)
 * The result of the function is a new instance of the Browser class.
 * @param url Optional start URL to open. Defaults to about:blank
 * @param options Optional settings, their defaults are provided by the getDefaultBrowseOptions() function.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const browse = (url, options, callback) => {
    const args = processBrowseArgs(url, options, callback);

    const browser = new Browser(args.options);
    const promise = browser._initialize()
        .then(() => {
            return browser.webDriver.get(args.options.url);
        })
        .then(() => {
            return browser;
        });

    return nodeifyPromise(promise, args.callback);
};


// /**
//  * Launches a debugging instance of Chrome on port 9222, without Selenium.
//  * This code is kept here for legacy reasons, it's not used.
//  * @param {boolean=} headless True (default) to launch Chrome in headless mode.
//  *     Set to false to launch Chrome normally.
//  * @return {Promise<ChromeLauncher>}
//  */
// export const launchChrome = (headless = !!process.env.APIFY_HEADLESS) => {
//     // code inspired by https://developers.google.com/web/updates/2017/04/headless-chrome
//     // TODO: enable other options e.g. userAgent, windowHeight, windowWidth, proxy
//
//     const launcher = new ChromeLauncher({
//         port: 9222,
//         autoSelectChrome: true, // False to manually select which Chrome install.
//         additionalFlags: [
//             '--window-size=412,732',
//             '--disable-gpu',
//             headless ? '--headless' : '',
//         ],
//     });
//
//     return newPromise()
//         .then(() => {
//             return launcher.run();
//         })
//         .then(() => {
//             return launcher;
//         })
//         .catch((err) => {
//             // Kill Chrome if there's an error.
//             return launcher.kill().then(() => {
//                 throw err;
//             }, console.error);
//         });
// };

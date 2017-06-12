// import { ChromeLauncher } from 'lighthouse/lighthouse-cli/chrome-launcher';
import { APIFY_ENV_VARS } from './constants';
import { newPromise, nodeifyPromise, parseUrl } from './utils';

/* global process, require */

// interesting resources:
// https://chromium.googlesource.com/chromium/src/+/master/docs/linux_debugging.md
// http://peter.sh/experiments/chromium-command-line-switches/#user-agent
// https://github.com/SeleniumHQ/selenium/tree/master/javascript/node/selenium-webdriver/example

// logging.installConsoleHandler();
// logging.getLogger('webdriver.http').setLevel(logging.Level.ALL);

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


// Base Squid proxy configuraton - enable all connection, disable all log files
const SQUID_CONF_BASE = `
http_access allow all
never_direct allow all
access_log none
cache_store_log none
cache_log /dev/null
logfile_rotate 0
`;

const getSquidConfForProxy = (parsedProxyUrl, squidPort) => {
    const peerName = `peer${squidPort}`;
    const aclName = `acl${squidPort}`;
    const str = `http_port ${squidPort}\n`
        + `cache_peer ${parsedProxyUrl.host} parent ${parsedProxyUrl.port} 0 no-query login=${parsedProxyUrl.auth} connect-fail-limit=99999999 proxy-only name=${peerName}\n` // eslint-disable-line max-len
        + `acl ${aclName} myport ${squidPort}\n`
        + `cache_peer_access ${peerName} allow ${aclName}\n`;
    return str;
};




class SquidProxyManager {
    constructor() {
        // A dictionary of all settings
        this.squidPortToParsedProxyUrl = {};
    }

    /**
     *
     * @param parsedProxyUrl
     * @return Promise Promise resolving to a handle for the proxy.
     */
    addProxy(parsedProxyUrl) {
    }

    removeProxy(handle) {
    }
}

const squidProxyManager = new SquidProxyManager();


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
        // TODO: add unit test!
        if (this.options.userAgent) {
            this.chromeOptions.addArguments(`--user-agent=${this.options.userAgent}`);
        }

        this.builder = new Builder();

        // Instance of Selenium's WebDriver
        this.webDriver = null;

        this.proxyHandle = null;
    }

    /**
     * Initializes the browser.
     * @return Promise
     */
    initialize() {
        // logging.installConsoleHandler();
        return newPromise()
            .then(() => {
                return this.setupProxy();
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
    setupProxy() {
        if (!this.parsedProxyUrl) return null;

        // NOTE: to view effective proxy settings in Chrome, open chrome://net-internals/#proxy
        // https://sites.google.com/a/chromium.org/chromedriver/capabilities
        // https://github.com/haad/proxychains/blob/0f61bd071389398a4c8378847a45973577593e6f/src/proxychains.conf
        // https://www.rootusers.com/configure-squid-proxy-to-forward-to-a-parent-proxy/
        // https://gist.github.com/leefsmp/3e4385e08ea27e30ba96
        // https://github.com/tinyproxy/tinyproxy

        return newPromise().then(() => {
            if (/^chrome$/i.test(this.options.browserName)) {
                // In Chrome Capabilities.setProxy() has no effect,
                // so we setup the proxy manually
                this.chromeOptions.addArguments(`--proxy-server=${this.parsedProxyUrl.host}`);
            } else {
                const proxyConfig = {
                    proxyType: 'MANUAL',
                    httpProxy: this.parsedProxyUrl.host,
                    sslProxy: this.parsedProxyUrl.host,
                    ftpProxy: this.parsedProxyUrl.host,
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
        if (this.proxy) {
            this.proxy.close();
            this.proxy = null;
        }

        return newPromise()
            .then(() => {
                if (this.webDriver) {
                    this.webDriver.quit();
                    this.webDriver = null;
                }
            });
    }
}


/**
 * Opens a new web browser, which is attached to Apifier debugger so that snapshots are sent to Run console (TODO).
 * Internally, this function calls Selenium WebDrivers's Builder command to create a new WebDriver instance.
 * (see http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_Builder.html)
 * The result of the function is a new instance of the Browser class.
 * @param url The start URL to open. Defaults to about:blank
 * @param options Configuration options, their defaults are provided by the getDefaultBrowseOptions() function.
 * @param callback Optional callback.
 * @return Returns a promise if no callback was provided, otherwise the return value is not defined.
 */
export const browse = (url, options = null, callback = null) => {
    url = url || 'about:blank';

    const browser = new Browser(options);
    const promise = browser.initialize()
        .then(() => {
            return browser.webDriver.get(url);
        })
        .then(() => {
            return browser;
        });

    return nodeifyPromise(promise, callback);
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

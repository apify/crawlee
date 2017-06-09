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


/**
 * Represents a single web browser process.
 * Currently it is just a thin wrapper of Selenium's WebDriver instance.
 */
export class Browser {
    constructor(webDriver) {
        this.webDriver = webDriver;
    }

    close() {
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
    options = Object.assign(getDefaultBrowseOptions(), options);

    // This is an optional dependency because it is quite large, only require it when used!
    const { Builder, Capabilities, logging } = require('selenium-webdriver'); // eslint-disable-line global-require
    const chrome = require('selenium-webdriver/chrome'); // eslint-disable-line global-require

    logging.installConsoleHandler();

    // By default, Selenium already defines a long list of command-line options
    // to enable browser automation, here we add a few other ones
    // (inspired by Lighthouse, see lighthouse/lighthouse-cli/chrome-launcher)
    const chromeOpts = new chrome.Options();

    // Define capabilities of the web browser,
    // see https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities for reference.
    const caps = new Capabilities();
    caps.set('browserName', options.browserName);

    // Disable built-in Google Translate service
    chromeOpts.addArguments('--disable-translate');

    // Disable fetching safebrowsing lists, likely redundant due to disable-background-networking
    chromeOpts.addArguments('--safebrowsing-disable-auto-update');

    // Run in headless mode if requested
    if (options.headless) {
        chromeOpts.addArguments('--headless', '--disable-gpu', '--no-sandbox');
    }

    // TODO: add unit test!
    if (options.userAgent) {
        chromeOpts.addArguments(`--user-agent=${options.userAgent}`);
    }

    if (options.proxyUrl) {
        const parsed = parseUrl(options.proxyUrl);

        if (!parsed.host || !parsed.port) throw new Error('Invalid "proxyUrl" option: the URL must contain hostname and port number.');
        if (parsed.scheme !== 'http') throw new Error('Invalid "proxyUrl" option: only HTTP proxy type is currently supported.');

        // NOTE: to view effective proxy settings in Chrome, open chrome://net-internals/#proxy
        // https://sites.google.com/a/chromium.org/chromedriver/capabilities
        // https://github.com/haad/proxychains/blob/0f61bd071389398a4c8378847a45973577593e6f/src/proxychains.conf
        // https://www.rootusers.com/configure-squid-proxy-to-forward-to-a-parent-proxy/
        // https://gist.github.com/leefsmp/3e4385e08ea27e30ba96
        // https://github.com/tinyproxy/tinyproxy

        // 1) install pkgsrc: http://pkgsrc.joyent.com/
        // 2) install tinyproxy: sudo pkgin -y install tinyproxy

        if (/^chrome$/i.test(options.browserName)) {
            // In Chrome Capabilities.setProxy() has no effect,
            // so we setup the proxy manually
            chromeOpts.addArguments(`--proxy-server=${parsed.host}`);
        } else {
            const proxyConfig = {
                proxyType: 'MANUAL',
                httpProxy: parsed.host,
                sslProxy: parsed.host,
                ftpProxy: parsed.host,
                // socksProxy: parsed.host,
                //socksUsername: parsed.username,
                //socksPassword: parsed.password,
                // noProxy: '', // Do not skip proxy for any address
            };
            caps.setProxy(proxyConfig);

            console.dir(caps);
        }
    }

    const webDriver = new Builder()
        .setChromeOptions(chromeOpts)
        .withCapabilities(caps)
        .build();

    const browser = new Browser(webDriver);

    const promise = newPromise()
        .then(() => webDriver.get(url))
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

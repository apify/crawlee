import urlModule from 'url';
import { ChromeLauncher } from 'lighthouse/lighthouse-cli/chrome-launcher';
import { APIFY_ENV_VARS } from './constants';
import { newPromise, nodeifyPromise } from './utils';

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
        browser: 'chrome',
        proxyUrl: null,
    };
};


/**
 * Represents a single web browser proces.
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
    const { Builder } = require('selenium-webdriver'); // eslint-disable-line global-require
    const chrome = require('selenium-webdriver/chrome'); // eslint-disable-line global-require

    // By default, Selenium already defines a long list of command-line options
    // to enable browser automation, here we add a few other ones
    // (inspired by Lighthouse, see lighthouse/lighthouse-cli/chrome-launcher)
    const chromeOpts = new chrome.Options();

    // Disable built-in Google Translate service
    chromeOpts.addArguments('--disable-translate');
    // Disable fetching safebrowsing lists, likely redundant due to disable-background-networking
    chromeOpts.addArguments('--safebrowsing-disable-auto-update');

    // Run in headless mode if requested
    if (options.headless) chromeOpts.addArguments('--headless', '--disable-gpu', '--no-sandbox');

    if (options.proxyUrl) {
        // TODO
        urlModule.parse(options.proxyUrl);

        /* --proxy-server
         proxy = {'address': '123.123.123.123:2345',
         'usernmae': 'johnsmith123',
         'password': 'iliketurtles'}


         capabilities = dict(DesiredCapabilities.CHROME)
         capabilities['proxy'] = {'proxyType': 'MANUAL',
         'httpProxy': proxy['address'],
         'ftpProxy': proxy['address'],
         'sslProxy': proxy['address'],
         'noProxy': '',
         'class': "org.openqa.selenium.Proxy",
         'autodetect': False}

         capabilities['proxy']['socksUsername'] = proxy['username']
         capabilities['proxy']['socksPassword'] = proxy['password']

         driver = webdriver.Chrome(executable_path=[path to your chromedriver], desired_capabilities=capabilities)
         */
    }

    const webDriver = new Builder()
        .forBrowser(options.browser)
        .setChromeOptions(chromeOpts)
        .build();

    const browser = new Browser(webDriver);

    const promise = newPromise()
        .then(() => webDriver.get(url))
        .then(() => {
            return browser;
        });

    return nodeifyPromise(promise, callback);
};


/**
 * Launches a debugging instance of Chrome on port 9222, without Selenium.
 * This code is kept here for legacy reasons, it's not used.
 * @param {boolean=} headless True (default) to launch Chrome in headless mode.
 *     Set to false to launch Chrome normally.
 * @return {Promise<ChromeLauncher>}
 */
export const launchChrome = (headless = !!process.env.APIFY_HEADLESS) => {
    // code inspired by https://developers.google.com/web/updates/2017/04/headless-chrome
    // TODO: enable other options e.g. userAgent, windowHeight, windowWidth, proxy

    const launcher = new ChromeLauncher({
        port: 9222,
        autoSelectChrome: true, // False to manually select which Chrome install.
        additionalFlags: [
            '--window-size=412,732',
            '--disable-gpu',
            headless ? '--headless' : '',
        ],
    });

    return newPromise()
    .then(() => {
        return launcher.run();
    })
    .then(() => {
        return launcher;
    })
    .catch((err) => {
        // Kill Chrome if there's an error.
        return launcher.kill().then(() => {
            throw err;
        }, console.error);
    });
};

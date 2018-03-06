// import { ChromeLauncher } from 'lighthouse/lighthouse-cli/chrome-launcher';
import { anonymizeProxy, closeAnonymizedProxy } from 'proxy-chain';
import { ENV_VARS } from './constants';
import { newPromise } from './utils';

/* global process, require */

// interesting resources:
// https://chromium.googlesource.com/chromium/src/+/master/docs/linux_debugging.md
// http://peter.sh/experiments/chromium-command-line-switches/#user-agent
// https://github.com/SeleniumHQ/selenium/tree/master/javascript/node/selenium-webdriver/example

// logging.installConsoleHandler();
// logging.getLogger('webdriver.http').setLevel(logging.Level.ALL);

// TODO: on first use of Apify.browse(), print out the version of Chrome and ChromeDriver

/**
 * Gets the default options for the browse() function, generated from current process environment
 * variables. This is function to enable unit testing.
 *
 * @ignore
 */
export const getDefaultBrowseOptions = () => {
    return {
        headless: !!process.env[ENV_VARS.HEADLESS],
        browserName: 'chrome',
        proxyUrl: null,
        userAgent: null,
    };
};

/**
 * Represents a single web browser process.
 * Currently it is just a thin wrapper of Selenium's WebDriver instance.
 *
 * @ignore
 */
export class Browser {
    constructor(options) {
        this.options = Object.assign(getDefaultBrowseOptions(), options);

        // This is an optional dependency because it is quite large, only require it when used
        const { Capabilities, Builder } = require('selenium-webdriver'); // eslint-disable-line global-require
        const chrome = require('selenium-webdriver/chrome'); // eslint-disable-line global-require

        this.anonymizedProxyUrl = null;

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
        if (this.options.extraChromeArguments) {
            this.chromeOptions.addArguments(this.options.extraChromeArguments);
        }

        this.builder = new Builder();

        // Instance of Selenium's WebDriver
        this.webDriver = null;
    }

    _initialize() {
        let promise = null;

        // Applies options.proxyUrl setting to the WebDriver's Capabilities and Chrome Options.
        // For proxy servers with authentication, this class starts a local proxy server
        // NOTE: to view effective proxy settings in Chrome, open chrome://net-internals/#proxy
        if (this.options.proxyUrl) {
            // NOTE: call anonymizeProxy() outside of promise, so that errors in proxyUrl are thrown!
            promise = anonymizeProxy(this.options.proxyUrl)
                .then((result) => {
                    this.anonymizedProxyUrl = result;

                    if (/^chrome$/i.test(this.options.browserName)) {
                        // In Chrome, Capabilities.setProxy() has no effect,
                        // so we setup the proxy manually
                        this.chromeOptions.addArguments(`--proxy-server=${this.anonymizedProxyUrl}`);
                    } else {
                        const proxyConfig = {
                            proxyType: 'MANUAL',
                            httpProxy: this.anonymizedProxyUrl,
                            sslProxy: this.anonymizedProxyUrl,
                            ftpProxy: this.anonymizedProxyUrl,
                        };
                        this.capabilities.setProxy(proxyConfig);
                    }
                });
        }

        // Ensure that the returned promise is of type set in setPromiseDependency()
        return newPromise()
            .then(() => {
                return promise;
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

    close() {
        return newPromise()
            .then(() => {
                if (this.webDriver) {
                    return this.webDriver.quit();
                }
            })
            .then(() => {
                if (this.anonymizedProxyUrl) {
                    return closeAnonymizedProxy(this.anonymizedProxyUrl, true);
                }
            })
            .then(() => {
                this.webDriver = null;
            });
    }
}

/**
 * Normalizes arguments for Apify.browse(), fills correctly default values.
 * The function is exported to allow unit testing.
 *
 * @param {String} [url]
 * @param {Object} [options]
 *
 * @ignore
 */
export const processBrowseArgs = (url, options) => {
    if (typeof (url) === 'object') {
        options = url;
        url = null;
    }
    options = Object.assign({}, options);
    options.url = url || options.url || 'about:blank';

    if (typeof (options.url) !== 'string') throw new Error('Invalid "url" provided.');

    return { options };
};

/*
OLD INFO FROM README:
### Browser

Apify runtime optionally depends on
the [selenium-webdriver](https://www.npmjs.com/package/selenium-webdriver) package that enables
automation of a web browser.
The simplest way to launch a new web browser is using the `Apify.browse([url,] [options)`
function. For example:

```javascript
const browser = await Apify.browse('https://www.example.com/');
```

or

```javascript
const browser = await Apify.browse({
    url: 'https://www.example.com/',
    userAgent: 'MyCrawlingBot/1.23',
});
```

The `options` parameter controls settings of the web browser and it has the following properties:

```javascript
{
    // Initial URL to open. Note that the url argument in Apify.browse() overrides this value.
    // The default value is 'about:blank'
    url: String,

    // The type of the web browser to use.
    // See https://github.com/SeleniumHQ/selenium/wiki/DesiredCapabilities for possible options.
    // The default value is 'chrome', which is currently the only fully-supported browser.
    browserName: String,

    // Indicates whether the browser should be opened in headless mode (i.e. without windows).
    // By default, this value is based on the APIFY_HEADLESS environment variable.
    headless: Boolean,

    // URL of the proxy server, e.g. 'http://username:password@1.2.3.4:55555'.
    // Currently only the 'http' proxy type is supported.
    // By default it is null, which means no proxy server is used.
    proxyUrl: String,

    // Overrides the User-Agent HTTP header of the web browser.
    // By default it is null, which means the browser uses its default User-Agent.
    userAgent: String,
}
```

The result of the `Apify.browse()` is a new instance of the `Browser` class,
which represents a web browser instance (possibly with multiple windows or tabs).

The `Browser` class has the following properties:

```javascript
{
    // An instance of the Selenium's WebDriver class.
    webDriver: Object,

    // A method that closes the web browser and releases associated resources.
    // The method has no arguments and returns a promise that resolves when the browser was closed.
    close: Function,
}
```

The `webDriver` property can be used to manipulate the web browser:

```javascript
const url = await browser.webDriver.getCurrentUrl();
```

For more information, see [WebDriver documentation](http://seleniumhq.github.io/selenium/docs/api/
javascript/module/selenium-webdriver/index_exports_WebDriver.html).

When the web browser is no longer needed, it should be closed:

```javascript
await browser.close();
```
 */

// TODO: browse() is only kept for backwards compatibility, get rid of it after no acts are using it!

/**
 * Opens a new web browser, which is attached to Apify debugger so that snapshots are sent to Run console (TODO).
 * Internally, this function calls Selenium WebDrivers's Builder command to create a new WebDriver instance.
 * (see http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_Builder.html)
 * The result of the function is a new instance of the Browser class.
 *
 * @param {String} [url] start URL to open. Defaults to about:blank
 * @param {Object} [options] settings, their defaults are provided by the getDefaultBrowseOptions() function.
 * @returns {Promise}
 *
 * @memberof module:Apify
 * @function
 * @ignore
 */
export const browse = (url, options) => {
    const args = processBrowseArgs(url, options);
    const browser = new Browser(args.options);

    return browser._initialize()
        .then(() => {
            return browser.webDriver.get(args.options.url);
        })
        .then(() => {
            return browser;
        });
};

/**
 * Opens a new instance of Chrome web browser
 * controlled by <a href="http://www.seleniumhq.org/projects/webdriver/" target="_blank">Selenium WebDriver</a>.
 * The result of the function is the new instance of the
 * <a href="http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebDriver.html" target="_blank">
 * WebDriver</a>
 * class.
 *
 * If the `APIFY_HEADLESS` environment variable is set to `1`, the function
 * runs the web browser in headless mode. Note that this environment variable is automatically set to `1` when
 * in acts running on the Apify Actor cloud platform.
 *
 * To use this function, you need to have Google Chrome and
 * <a href="https://sites.google.com/a/chromium.org/chromedriver/" target="_blank">ChromeDriver</a> installed in your environment.
 * For example, you can use the `apify/actor-node-chrome` base Docker image for your act - see
 * <a href="https://www.apify.com/docs/actor#base-images" target="_blank">documentation</a>
 * for more details.
 *
 * @param {Object} [opts] Optional settings passed to `puppeteer.launch()`. Additionally the object can contain the following fields:
 * @param {String} [opts.proxyUrl] - URL to a proxy server. Currently only `http://` scheme is supported.
 * Port number must be specified. For example, `http://example.com:1234`.
 * @param {String} [opts.userAgent] - Default User-Agent for the browser.
 * @returns {Promise}
 *
 * @memberof module:Apify
 * @name launchWebDriver
 * @instance
 * @function
 */
export const launchWebDriver = (opts) => {
    const args = processBrowseArgs(undefined, opts);
    const browser = new Browser(args.options);

    // NOTE: eventually get rid of the Browser class
    return browser._initialize()
        .then(() => {
            // TODO: for some reason this doesn't work, the proxy chain will never shut down!!
            //       BTW this also prevents us from upgrading to mocha 4+
            // we'll need to find a way to fix this!
            // browser.webDriver.onQuit_ = () => {
            //    if (browser.proxyChain) {
            //        browser.proxyChain.shutdown();
            //        browser.proxyChain = null;
            //    }
            // };

            return browser.webDriver;
        });
};

// /**
//  * Launches a debugging instance of Chrome on port 9222, without Selenium.
//  * This code is kept here for legacy reasons, it's not used.
//  * @param {boolean=} headless True (default) to launch Chrome in headless mode.
//  *     Set to false to launch Chrome normally.
//  * @returns {Promise<ChromeLauncher>}
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

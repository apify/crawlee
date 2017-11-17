// import { ChromeLauncher } from 'lighthouse/lighthouse-cli/chrome-launcher';
import { ENV_VARS } from './constants';
import { newPromise, nodeifyPromise, parseUrl } from './utils';


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
 * @ignore
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
        if (this.options.extraChromeArguments) {
            this.chromeOptions.addArguments(this.options.extraChromeArguments);
        }

        this.builder = new Builder();

        // Instance of Selenium's WebDriver
        this.webDriver = null;

        // Instance of ProxyChain or null if not used
        this.proxyChain = null;
    }

    /**
     * Initializes the browser.
     * @returns Promise
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
                // In Chrome, Capabilities.setProxy() has no effect,
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

                // console.dir(this.capabilities);
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
                this.webDriver = null;
            });
    }
}

/**
 * Normalizes arguments for Apify.browse(), fills correctly default values.
 * The function is exported to allow unit testing.
 * @param url Optional string
 * @param options Optional object
 * @param callback Optional function
 * @ignore
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

/*
OLD INFO FROM README:
### Browser

Apify runtime optionally depends on
the [selenium-webdriver](https://www.npmjs.com/package/selenium-webdriver) package that enables
automation of a web browser.
The simplest way to launch a new web browser is using the `Apify.browse([url,] [options,] [callback])`
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
If you pass a Node.js-style callback the `Browser` instance is passed to it,
otherwise the `Apify.browse()` function returns a promise that resolves to the `Browser` instance.

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

/**
 * @memberof module:Apify
 * @function
 * @description Opens a new web browser, which is attached to Apify debugger so that snapshots are sent to Run console (TODO).
 * Internally, this function calls Selenium WebDrivers's Builder command to create a new WebDriver instance.
 * (see http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_Builder.html)
 * The result of the function is a new instance of the Browser class.
 * @param url Optional start URL to open. Defaults to about:blank
 * @param options Optional settings, their defaults are provided by the getDefaultBrowseOptions() function.
 * @param callback Optional callback.
 * @returns Returns a promise if no callback was provided, otherwise the return value is not defined.
 * @ignore
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

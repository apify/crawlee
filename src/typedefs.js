/*
 * This file only declares reusable JSDoc types (@typedef's and @callback's) and is not supposed to contain any Javascript code.
 */

// Declarations for BasicCrawler
/**
 * @callback HandleRequest
 * @param {HandleRequestInputs} inputs Arguments passed to this callback.
 * @returns {void}
 */
/**
 * @typedef HandleRequestInputs
 * @property {Request} request The original {Request} object.
 * @property {AutoscaledPool} [autoscaledPool]
 */

/**
 * @callback HandleFailedRequest
 * @param {HandleFailedRequestInput} inputs Arguments passed to this callback.
 * @returns {void}
 */
/**
 * @typedef HandleFailedRequestInput
 * @property {Request} request The original {Request} object.
 * @property {Error} error The Error thrown by `handleRequestFunction`.
 */

// Declarations for CheerioCrawler
/**
 * @typedef CheerioHandlePageInputs
 * @property {CheerioStatic} $ The <a href="https://cheerio.js.org/">Cheerio</a> object with parsed HTML.
 * @property {String|Buffer} body The request body of the web page.
 * @property {Object} [json] The parsed object from JSON string if the response contains the content type application/json.
 * @property {Request} request The original {Request} object.
 * @property {Object} contentType Parsed `Content-Type header: { type, encoding }`.
 * @property {Object} response An instance of Node's http.IncomingMessage object,
 * @property {AutoscaledPool} autoscaledPool
 */
/**
 * @callback CheerioHandlePage
 * @param {CheerioHandlePageInputs} inputs Arguments passed to this callback.
 * @returns {void|Promise<void>}
 */

/**
 * @typedef PrepareRequestInputs
 * @property {Request} [request] Original instance fo the {Request} object. Must be modified in-place.
 */
/**
 * @callback PrepareRequest
 * @param {PrepareRequestInputs} inputs Arguments passed to this callback.
 * @returns {void}
 */

// Declarations for PuppeteerCrawler
// TODO yin: types of response and page properties are exchanged, probably
/**
 * @typedef PuppeteerHandlePageInputs
 * @property {Request} request An instance of the {@link Request} object with details about the URL to open, HTTP method etc.
 * @property {PuppeteerResponse} response An instance of the `Puppeteer`
 *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-page" target="_blank"><code>Page</code></a>
 * @property {PuppeteerPage} page is an instance of the `Puppeteer`
 *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-class-response" target="_blank"><code>Response</code></a>,
 *   which is the main resource response as returned by `page.goto(request.url)`.
 * @property {PuppeteerPool} puppeteerPool An instance of the {@link PuppeteerPool} used by this `PuppeteerCrawler`.
 * @property {AutoscaledPool} autoscaledPool
 * @return {Promise<void>}
 */
/**
 * @callback PuppeteerHandlePage
 * @param {PuppeteerHandlePageInputs} inputs Arguments passed to this callback.
 * @return {Promise<void>}
 */

// import('puppeteer.js').LaunchPuppeteerOptions
/**
 * Apify extends the launch options of Puppeteer.
 * You can use any of the
 * <a href="https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions" target="_blank"><code>puppeteer.launch()</code></a>
 * options in the [`Apify.launchPuppeteer()`](../api/apify#module_Apify.launchPuppeteer)
 * function and in addition, all the options available below.
 *
 * @typedef {Object} LaunchPuppeteerOptions
 * @property ...
 *   You can use any of the
 *   <a href="https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions" target="_blank"><code>puppeteer.launch()</code></a>
 *   options.
 * @property {String} [proxyUrl]
 *   URL to a HTTP proxy server. It must define the port number,
 *   and it may also contain proxy username and password.
 *
 *   Example: `http://bob:pass123@proxy.example.com:1234`.
 * @property {String} [userAgent]
 *   The `User-Agent` HTTP header used by the browser.
 *   If not provided, the function sets `User-Agent` to a reasonable default
 *   to reduce the chance of detection of the crawler.
 * @property {Boolean} [useChrome=false]
 *   If `true` and `executablePath` is not set,
 *   Puppeteer will launch full Google Chrome browser available on the machine
 *   rather than the bundled Chromium. The path to Chrome executable
 *   is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
 *   or defaults to the typical Google Chrome executable location specific for the operating system.
 *   By default, this option is `false`.
 * @property {Boolean} [useApifyProxy=false]
 *   If set to `true`, Puppeteer will be configured to use
 *   <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> for all connections.
 *   For more information, see the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a>
 * @property {String[]} [apifyProxyGroups]
 *   An array of proxy groups to be used
 *   by the <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @property {String} [apifyProxySession]
 *   Apify Proxy session identifier to be used by all the Chrome browsers.
 *   All HTTP requests going through the proxy with the same session identifier
 *   will use the same target proxy server (i.e. the same IP address).
 *   The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 *   Only applied if the `useApifyProxy` option is `true`.
 * @property {string|Object} [puppeteerModule]
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

// TODO yin: Go through all referenced types and provide proper imports for them
import { Page as PuppeteerPage, Response as PuppeteerResponse } from 'puppeteer'; // eslint-disable-line no-unused-vars
import Request from './request'; // eslint-disable-line no-unused-vars
import AutoscaledPool from './autoscaling/autoscaled_pool'; // eslint-disable-line no-unused-vars
import PuppeteerPool from './puppeteer_pool'; // eslint-disable-line no-unused-vars
import 'cheerio'; // eslint-disable-line no-unused-vars

export {};

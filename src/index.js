import EventEmitter from 'events';
import log from 'apify-shared/log';
import { ENV_VARS } from 'apify-shared/consts';
import { main, getEnv, call, callTask, getApifyProxyUrl, metamorph, addWebhook } from './actor';
import AutoscaledPool from './autoscaling/autoscaled_pool';
import BasicCrawler from './basic_crawler';
import CheerioCrawler from './cheerio_crawler';
import { pushData, openDataset } from './dataset';
import events, { initializeEvents, stopEvents } from './events';
import { getValue, setValue, getInput, openKeyValueStore } from './key_value_store';
import { launchPuppeteer } from './puppeteer';
import PuppeteerCrawler from './puppeteer_crawler';
import PuppeteerPool from './puppeteer_pool';
import Request from './request';
import { RequestList, openRequestList } from './request_list';
import { openRequestQueue } from './request_queue';
import SettingsRotator from './settings_rotator';
import { apifyClient, getMemoryInfo, isAtHome, publicUtils, logSystemInfo } from './utils';
import { browse, launchWebDriver } from './webdriver';
import { puppeteerUtils } from './puppeteer_utils';
import { socialUtils } from './utils_social';
import { enqueueLinks } from './enqueue_links';
import PseudoUrl from './pseudo_url';
import LiveViewServer from './live_view/live_view_server';
import { requestAsBrowser } from './utils_request';

/* globals module */

// Increase the global limit for event emitter memory leak warnings.
EventEmitter.defaultMaxListeners = 50;

// Log as plain text not JSON
log.logJson = false;

// TODO: remove this when we release v1.0.0
const EMULATION_ENV_VAR = 'APIFY_LOCAL_EMULATION_DIR';
if (process.env[EMULATION_ENV_VAR]) {
    log.warning(`Environment variable "${EMULATION_ENV_VAR}" is deprecated!!! Use "${ENV_VARS.LOCAL_STORAGE_DIR}" instead!`);
    if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR]) process.env[ENV_VARS.LOCAL_STORAGE_DIR] = process.env[EMULATION_ENV_VAR];
}

// Logging some basic system info (apify and apify-client version, NodeJS version, ...).
logSystemInfo();

/**
 * The following section describes all functions and properties provided by the `apify` package,
 * except individual classes and namespaces that have their separate, detailed, documentation pages
 * accessible from the left sidebar.
 *
 * @module Apify
 */
module.exports = {
    // Actor
    main,
    getEnv,
    call,
    callTask,
    metamorph,
    getMemoryInfo,
    getApifyProxyUrl,
    isAtHome,
    client: apifyClient,
    addWebhook,

    // Autoscaled pool
    AutoscaledPool,

    // Basic crawler
    BasicCrawler,

    // Cheerio crawler
    CheerioCrawler,

    // Dataset
    pushData,
    openDataset,

    // Events
    events,
    initializeEvents,
    stopEvents,

    // Key-value store
    getValue,
    setValue,
    getInput,
    openKeyValueStore,

    // Puppeteer
    launchPuppeteer,
    PuppeteerPool,
    PuppeteerCrawler,

    // PseudoUrl
    PseudoUrl,

    // Requests
    Request,
    RequestList,
    openRequestList,
    openRequestQueue,

    // Settings rotator
    SettingsRotator,

    // Live View
    LiveViewServer,

    // Webdriver
    browse,
    launchWebDriver,

    // utils
    utils: Object.assign(publicUtils, {
        puppeteer: puppeteerUtils,
        social: socialUtils,
        log,
        enqueueLinks,
        requestAsBrowser,
    }),
};

// Add docs for log separately, as it's imported from apify-shared.
// Adding them directly to the log object in utils breaks JSDoc.

/**
 * The log instance enables level aware logging of messages and we advise
 * to use it instead of `console.log()` and its aliases in most development
 * scenarios.
 *
 * A very useful use case for `log` is using `log.debug` liberally throughout
 * the codebase to get useful logging messages only when appropriate log level is set
 * and keeping the console tidy in production environments.
 *
 * The available logging levels are, in this order: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `OFF`
 * and can be referenced from the `log.LEVELS` constant, such as `log.LEVELS.ERROR`.
 *
 * To log messages to the system console, use the `log.level(message)` invocation,
 * such as `log.debug('this is a debug message')`.
 *
 * To prevent writing of messages above a certain log level to the console, simply
 * set the appropriate level. The default log level is `INFO`, which means that
 * `DEBUG` messages will not be printed, unless enabled.
 *
 * **Example:**
 * ```
 * const Apify = require('apify');
 * const { log } = Apify.utils;
 *
 * log.info('Information message', { someData: 123 }); // prints message
 * log.debug('Debug message', { debugData: 'hello' }); // doesn't print anything
 *
 * log.setLevel(log.LEVELS.DEBUG);
 * log.debug('Debug message'); // prints message
 *
 * log.setLevel(log.LEVELS.ERROR);
 * log.debug('Debug message'); // doesn't print anything
 * log.info('Info message'); // doesn't print anything
 *
 * log.error('Error message', { errorDetails: 'This is bad!' }); // prints message
 * try {
 *   throw new Error('Not good!');
 * } catch (e) {
 *   log.exception(e, 'Exception occurred', { errorDetails: 'This is really bad!' }); // prints message
 * }
 * ```
 *
 * Another very useful way of setting the log level is by setting the `APIFY_LOG_LEVEL`
 * environment variable, such as `APIFY_LOG_LEVEL=DEBUG`. This way, no code changes
 * are necessary to turn on your debug messages and start debugging right away.
 * @namespace log
 */

/**
 * Map of available log levels that's useful for easy setting of appropriate log levels.
 * Each log level is represented internally by a number. Eg. `log.LEVELS.DEBUG === 5`.
 * @name LEVELS
 * @type Object
 * @memberOf log
 */

/**
 * Sets the log level to the given value, preventing messages from less important log levels
 * from being printed to the console. Use in conjunction with the `log.LEVELS` constants such as
 *
 * ```
 * log.setLevel(log.LEVELS.DEBUG);
 * ```
 *
 * Default log level is INFO.
 * @name setLevel
 * @param {number} level
 * @method
 * @memberOf log
 */

/**
 * Returns the currently selected logging level. This is useful for checking whether a message
 * will actually be printed to the console before one actually performs a resource intensive operation
 * to construct the message, such as querying a DB for some metadata that need to be added. If the log
 * level is not high enough at the moment, it doesn't make sense to execute the query.
 * @name getLevel
 * @method
 * @memberOf log
 */

/**
 * Logs a `DEBUG` message. By default, it will not be written to the console. To see `DEBUG`
 * messages in the console, set the log level to `DEBUG` either using the `log.setLevel(log.LEVELS.DEBUG)`
 * method or using the environment variable `APIFY_LOG_LEVEL=DEBUG`. Data are stringified and appended
 * to the message.
 * @name debug
 * @param {string} message
 * @param {Object} [data]
 * @method
 * @memberOf log
 */

/**
 * Logs an `INFO` message. `INFO` is the default log level so info messages will be always logged,
 * unless the log level is changed. Data are stringified and appended to the message.
 * @name info
 * @param {string} message
 * @param {Object} [data]
 * @method
 * @memberOf log
 */

/**
 * Logs a `WARNING` level message. Data are stringified and appended to the message.
 * @name warning
 * @param {string} message
 * @param {Object} [data]
 * @method
 * @memberOf log
 */

/**
 * Logs an `ERROR` message. Use this method to log error messages that are not directly connected
 * to an exception. For logging exceptions, use the `log.exception` method.
 * @name error
 * @param {string} message
 * @param {Object} [data]
 * @method
 * @memberOf log
 */

/**
 * Logs an `ERROR` level message with a nicely formatted exception. Note that the exception is the first parameter
 * here and an additional message is only optional.
 * @name exception
 * @param {Error} exception
 * @param {string} [message]
 * @param {Object} [data]
 * @method
 * @memberOf log
 */

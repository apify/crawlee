import { ACTOR_EVENT_NAMES } from 'apify-shared/consts';

/**
 * The default user agent used by `Apify.launchPuppeteer`.
 * Last updated on 2018-12-30.
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36'; // eslint-disable-line max-len

/**
 * Exit codes for the actor process.
 * The error codes must be in the range 1-128, to avoid collision with signal exits
 * and to ensure Docker will handle them correctly!
 */
export const EXIT_CODES = {
    SUCCESS: 0,
    ERROR_USER_FUNCTION_THREW: 91,
    ERROR_UNKNOWN: 92,
};

/**
 * These events are just internal for Apify package, so we don't need them in apify-shared package.
 *
 * @type {{CPU_INFO: String, SYSTEM_INFO: String, MIGRATING: String, PERSIST_STATE: String}}
 *
 */
export const ACTOR_EVENT_NAMES_EX = Object.assign({}, ACTOR_EVENT_NAMES, { PERSIST_STATE: 'persistState' });

/**
 * Most common user agents from https://techblog.willshouse.com/2012/01/03/most-common-user-agents/
 *
 * Last updated on 2019-02-18.
 */
export const USER_AGENT_LIST = require('top-user-agents');

/**
 * Base URL of Apify's API endpoints.
 * @type {string}
 */
export const APIFY_API_BASE_URL = 'https://api.apify.com/v2';

/**
 * Multiplier used in CheerioCrawler and PuppeteerCrawler to set a reasonable
 * handleRequestTimeoutSecs in BasicCrawler that would not impare functionality.
 *
 * @type {number}
 */
export const BASIC_CRAWLER_TIMEOUT_MULTIPLIER = 10;

export const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export const STATUS_CODES_BLOCKED = [401, 403, 429];

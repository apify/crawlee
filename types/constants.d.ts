/**
 * The default user agent used by `Apify.launchPuppeteer`.
 * Last updated on 2018-12-30.
 */
export const DEFAULT_USER_AGENT: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36";
export namespace EXIT_CODES {
    export const SUCCESS: number;
    export const ERROR_USER_FUNCTION_THREW: number;
    export const ERROR_UNKNOWN: number;
}
/**
 * These events are just internal for Apify package, so we don't need them in apify-shared package.
 *
 * @type {{CPU_INFO: string, SYSTEM_INFO: string, MIGRATING: string, PERSIST_STATE: string}}
 */
export const ACTOR_EVENT_NAMES_EX: {
    CPU_INFO: string;
    SYSTEM_INFO: string;
    MIGRATING: string;
    PERSIST_STATE: string;
};
/**
 * Most common user agents from https://techblog.willshouse.com/2012/01/03/most-common-user-agents/
 *
 * Last updated on 2019-02-18.
 */
export const USER_AGENT_LIST: string[];
/**
 * Base URL of Apify's API endpoints.
 * @type {string}
 */
export const APIFY_API_BASE_URL: string;
/**
 * Multiplier used in CheerioCrawler and PuppeteerCrawler to set a reasonable
 * handleRequestTimeoutSecs in BasicCrawler that would not impare functionality.
 *
 * @type {number}
 */
export const BASIC_CRAWLER_TIMEOUT_MULTIPLIER: number;
export const COUNTRY_CODE_REGEX: RegExp;
export const STATUS_CODES_BLOCKED: number[];

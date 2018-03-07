import * as consts from 'apify-shared/consts';

consts.DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36'; // eslint-disable-line max-len
consts.DEFAULT_PROXY_HOSTNAME = 'proxy.apify.com';
consts.DEFAULT_PROXY_PORT = 8000;

/**
 * Exit codes for the act process.
 * The error codes must be in range 1-128, to avoid collision with signal exits
 * and to ensure Docker will handle them correctly!
 */
consts.EXIT_CODES = {
    SUCCESS: 0,
    ERROR_USER_FUNCTION_THREW: 91,
    ERROR_UNKNOWN: 92,
};

/**
 * Dictionary of APIFY_XXX environment variable names.
 */
consts.ENV_VARS = {
    ACT_ID: 'APIFY_ACT_ID',
    ACT_RUN_ID: 'APIFY_ACT_RUN_ID',
    USER_ID: 'APIFY_USER_ID',
    TOKEN: 'APIFY_TOKEN',
    PROXY_PASSWORD: 'APIFY_PROXY_PASSWORD',
    PROXY_HOSTNAME: 'APIFY_PROXY_HOSTNAME',
    PROXY_PORT: 'APIFY_PROXY_PORT',
    STARTED_AT: 'APIFY_STARTED_AT',
    TIMEOUT_AT: 'APIFY_TIMEOUT_AT',
    DEFAULT_KEY_VALUE_STORE_ID: 'APIFY_DEFAULT_KEY_VALUE_STORE_ID',
    DEFAULT_DATASET_ID: 'APIFY_DEFAULT_DATASET_ID',
    LOCAL_EMULATION_DIR: 'APIFY_LOCAL_EMULATION_DIR',
    WATCH_FILE: 'APIFY_WATCH_FILE',
    API_BASE_URL: 'APIFY_API_BASE_URL',
    HEADLESS: 'APIFY_HEADLESS',
    XVFB: 'APIFY_XVFB',
    INTERNAL_PORT: 'APIFY_INTERNAL_PORT',
    MEMORY_MBYTES: 'APIFY_MEMORY_MBYTES',
    LOG_LEVEL: 'APIFY_LOG_LEVEL',
    ACTOR_EVENTS_WS_URL: 'APIFY_ACTOR_EVENTS_WS_URL',
};

consts.KEY_VALUE_STORE_KEYS = {
    INPUT: 'INPUT',
    OUTPUT: 'OUTPUT',
};

module.exports = consts;


/**
 * Exit codes for the act process.
 * The error codes must be in range 1-128, to avoid collision with signal exits
 * and to ensure Docker will handle them correctly!
 */
export const EXIT_CODES = {
    SUCCESS: 0,
    ERROR_USER_FUNCTION_THREW: 91,
    ERROR_GETTING_INPUT: 92,
    ERROR_SETTING_OUTPUT: 93,
    ERROR_UNKNOWN: 94,
};

/**
 * Dictionary of APIFY_XXX environment variable names.
 */
export const ENV_VARS = {
    INTERNAL_PORT: 'APIFY_INTERNAL_PORT',
    ACT_ID: 'APIFY_ACT_ID',
    ACT_RUN_ID: 'APIFY_ACT_RUN_ID',
    USER_ID: 'APIFY_USER_ID',
    TOKEN: 'APIFY_TOKEN',
    STARTED_AT: 'APIFY_STARTED_AT',
    TIMEOUT_AT: 'APIFY_TIMEOUT_AT',
    DEFAULT_KEY_VALUE_STORE_ID: 'APIFY_DEFAULT_KEY_VALUE_STORE_ID',
    WATCH_FILE: 'APIFY_WATCH_FILE',
    API_BASE_URL: 'APIFY_API_BASE_URL',
    HEADLESS: 'APIFY_HEADLESS',
};


export const KEY_VALUE_STORE_KEYS = {
    INPUT: 'INPUT',
    OUTPUT: 'OUTPUT',
};

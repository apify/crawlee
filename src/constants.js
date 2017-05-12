
/**
 * Process exit codes for the act process.
 */
export const EXIT_CODES = {
    SUCCESS: 0,
    ERROR_USER_FUNCTION_THREW: 1,
    ERROR_GETTING_INPUT: 2,
    ERROR_SETTING_OUTPUT: 3,
    ERROR_UNKNOWN: 4,
};

/**
 * Dictionary of APIFY_XXX environment variable names.
 */
export const APIFY_ENV_VARS = {
    INTERNAL_PORT: 'APIFY_INTERNAL_PORT',
    ACT_ID: 'APIFY_ACT_ID',
    ACT_RUN_ID: 'APIFY_ACT_RUN_ID',
    STARTED_AT: 'APIFY_STARTED_AT',
    TIMEOUT_AT: 'APIFY_TIMEOUT_AT',
    DEFAULT_KEY_VALUE_STORE_ID: 'APIFY_DEFAULT_KEY_VALUE_STORE_ID',
    WATCH_FILE: 'APIFY_WATCH_FILE',
};

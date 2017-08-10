
/**
 * Default wait of Apify.call() method.
 */
export const DEFAULT_APIFY_CALL_WAIT_SECS = 180;

/**
 * Exit codes for the act process.
 * The error codes must be in range 1-128, to avoid collision with signal exits
 * and to ensure Docker will handle them correctly!
 */
export const EXIT_CODES = {
    SUCCESS: 0,
    ERROR_USER_FUNCTION_THREW: 91,
    ERROR_UNKNOWN: 92,
};

/**
 * Dictionary of APIFY_XXX environment variable names.
 */
export const ENV_VARS = {
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
    INTERNAL_PORT: 'APIFY_INTERNAL_PORT',
};

export const KEY_VALUE_STORE_KEYS = {
    INPUT: 'INPUT',
    OUTPUT: 'OUTPUT',
};

/**
 * Dictionary of possible values for 'status' field of act2Builds or act2Runs collections.
 */
export const ACT_TASK_STATUSES = {
    READY: 'READY', // started but not allocated to any worker yet
    RUNNING: 'RUNNING', // running on worker
    SUCCEEDED: 'SUCCEEDED', // finished and all good
    FAILED: 'FAILED', // run or build failed
    TIMING_OUT: 'TIMING-OUT',  // timing out now
    TIMED_OUT: 'TIMED-OUT', // timed out
    ABORTING: 'ABORTING', // being aborted by user
    ABORTED: 'ABORTED', // aborted by user
};

/**
 * An array of act task statuses that are final for the task.
 */
export const ACT_TASK_TERMINAL_STATUSES = [
    ACT_TASK_STATUSES.SUCCEEDED,
    ACT_TASK_STATUSES.FAILED,
    ACT_TASK_STATUSES.TIMED_OUT,
    ACT_TASK_STATUSES.ABORTED,
];

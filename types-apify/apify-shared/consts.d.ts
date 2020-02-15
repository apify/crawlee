declare module 'apify-shared/consts' {
    export const ACTOR_EVENT_NAMES: {
        MIGRATING: string;
        SYSTEM_INFO: string;
        CPU_INFO: string;
    };
    export const REQUEST_QUEUE_HEAD_MAX_LIMIT: number;
    export const ENV_VARS: {
        MEMORY_MBYTES: string;
        API_BASE_URL: string;
        IS_AT_HOME: string;
        SDK_LATEST_VERSION: string;
        TOKEN: string;
        ACTOR_RUN_ID: string;
        CONTAINER_PORT: string;
        CONTAINER_URL: string;
        LOCAL_STORAGE_DIR: string;
        DEFAULT_DATASET_ID: string;
        USER_ID: string;
        DEFAULT_KEY_VALUE_STORE_ID: string;
        ACTOR_EVENTS_WS_URL: string;
        INPUT_KEY: string;
    };
    export const KEY_VALUE_STORE_KEYS: {
        INPUT: string;
    };
    export const LOCAL_STORAGE_SUBDIRS: {
        datasets: string;
        requestQueues: string;
        keyValueStores: string;
    };
    export const MAX_PAYLOAD_SIZE_BYTES: {

    };
    export const INTEGER_ENV_VARS: {

    };
    export const ACT_JOB_TERMINAL_STATUSES: {

    };
    export const ACT_JOB_STATUSES: {

    };
    export const LOCAL_ENV_VARS: {
        [index: string]: string;
        CONTAINER_PORT: string;
        CONTAINER_URL: string;
    };
}

declare module 'apify-shared/consts' {
    export const ACTOR_EVENT_NAMES: {
        MIGRATING: string;
        SYSTEM_INFO: string;
        CPU_INFO: string;
    };
    export const ENV_VARS: {
        MEMORY_MBYTES: string;
        CONTAINER_PORT: string;
        CONTAINER_URL: string;
        LOCAL_STORAGE_DIR: string;
        DEFAULT_DATASET_ID: string;
        USER_ID: string;
        ACTOR_EVENTS_WS_URL: string;
    };
    export const LOCAL_STORAGE_SUBDIRS: {
        datasets: string
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

export function getEnv(): ApifyEnv;
export function main(userFunc: Function): void;
export function call(actId: string, input?: any, options?: {
    contentType?: string;
    token?: string;
    memoryMbytes?: number;
    timeoutSecs?: number;
    build?: string;
    waitSecs?: string;
    fetchOutput?: boolean;
    disableBodyParser?: boolean;
    webhooks?: any[];
}): Promise<ActorRun>;
export function callTask(taskId: string, input?: any, options?: {
    contentType?: string;
    token?: string;
    memoryMbytes?: number;
    timeoutSecs?: number;
    build?: string;
    waitSecs?: string;
    webhooks?: any[];
}): Promise<ActorRun>;
export function metamorph(targetActorId: string, input?: any, options?: {
    contentType?: string;
    build?: string;
}): Promise<void>;
export function getApifyProxyUrl(options?: {
    password?: string;
    groups?: string[];
    session?: string;
    country?: string;
}): string;
export function addWebhook({ eventTypes, requestUrl, payloadTemplate, idempotencyKey }: {
    eventTypes: string[];
    requestUrl: string;
    payloadTemplate?: string;
    idempotencyKey?: string;
}): Promise<any>;
/**
 * Parsed representation of the `APIFY_XXX` environmental variables.
 */
export type ApifyEnv = {
    /**
     * ID of the actor (APIFY_ACTOR_ID)
     */
    actorId: string;
    /**
     * ID of the actor run (APIFY_ACTOR_RUN_ID)
     */
    actorRunId: string;
    /**
     * ID of the actor task (APIFY_ACTOR_TASK_ID)
     */
    actorTaskId: string;
    /**
     * ID of the user who started the actor - note that it might be
     * different than the owner ofthe actor (APIFY_USER_ID)
     */
    userId: string;
    /**
     * Authentication token representing privileges given to the actor run,
     * it can be passed to various Apify APIs (APIFY_TOKEN)
     */
    token: string;
    /**
     * Date when the actor was started (APIFY_STARTED_AT)
     */
    startedAt: Date;
    /**
     * Date when the actor will time out (APIFY_TIMEOUT_AT)
     */
    timeoutAt: Date;
    /**
     * ID of the key-value store where input and output data of this
     * actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
     */
    defaultKeyValueStoreId: string;
    /**
     * ID of the dataset where input and output data of this
     * actor is stored (APIFY_DEFAULT_DATASET_ID)
     */
    defaultDatasetId: string;
    /**
     * Amount of memory allocated for the actor,
     * in megabytes (APIFY_MEMORY_MBYTES)
     */
    memoryMbytes: number;
};
import { ActorRun } from "./typedefs";

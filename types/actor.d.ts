export function getEnv(): ApifyEnv;
export function main(userFunc: Function): void;
export function call<T extends string | Object | Buffer, R>(actId: string, input?: T | undefined, options?: {
    contentType?: string;
    token?: string;
    memoryMbytes?: number;
    timeoutSecs?: number;
    build?: string;
    waitSecs?: string;
    fetchOutput?: boolean;
    disableBodyParser?: boolean;
    webhooks?: any[];
} | undefined): Promise<ActorRun<R>>;
export function callTask<R, T extends string | Object | Buffer>(taskId: string, input?: T | undefined, options?: {
    contentType?: string;
    token?: string;
    memoryMbytes?: number;
    timeoutSecs?: number;
    build?: string;
    waitSecs?: string;
    webhooks?: any[];
} | undefined): Promise<ActorRun<R>>;
export function metamorph<T extends string | Object | Buffer>(targetActorId: string, input?: T | undefined, options?: {
    contentType?: string;
    build?: string;
} | undefined): Promise<void>;
export function getApifyProxyUrl(options?: {
    password?: string;
    groups?: string[];
    session?: string;
    country?: string;
} | undefined): string;
export function addWebhook<R>({ eventTypes, requestUrl, payloadTemplate, idempotencyKey }: {
    eventTypes: string[];
    requestUrl: string;
    payloadTemplate?: string;
    idempotencyKey?: string;
}): Promise<R>;
/**
 * Parsed representation of the `APIFY_XXX` environmental variables.
 */
export type ApifyEnv = {
    /**
     * ID of the actor (APIFY_ACTOR_ID)
     */
    actorId: string | null;
    /**
     * ID of the actor run (APIFY_ACTOR_RUN_ID)
     */
    actorRunId: string | null;
    /**
     * ID of the actor task (APIFY_ACTOR_TASK_ID)
     */
    actorTaskId: string | null;
    /**
     * ID of the user who started the actor - note that it might be
     * different than the owner ofthe actor (APIFY_USER_ID)
     */
    userId: string | null;
    /**
     * Authentication token representing privileges given to the actor run,
     * it can be passed to various Apify APIs (APIFY_TOKEN)
     */
    token: string | null;
    /**
     * Date when the actor was started (APIFY_STARTED_AT)
     */
    startedAt: Date | null;
    /**
     * Date when the actor will time out (APIFY_TIMEOUT_AT)
     */
    timeoutAt: Date | null;
    /**
     * ID of the key-value store where input and output data of this
     * actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
     */
    defaultKeyValueStoreId: string | null;
    /**
     * ID of the dataset where input and output data of this
     * actor is stored (APIFY_DEFAULT_DATASET_ID)
     */
    defaultDatasetId: string | null;
    /**
     * Amount of memory allocated for the actor,
     * in megabytes (APIFY_MEMORY_MBYTES)
     */
    memoryMbytes: number | null;
};
import { ActorRun } from "./typedefs";

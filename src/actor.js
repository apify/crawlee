import ow from 'ow';
import * as path from 'path';
import * as _ from 'underscore';
import { ENV_VARS, INTEGER_ENV_VARS, ACT_JOB_STATUSES } from 'apify-shared/consts';
import log from './utils_log';
import { EXIT_CODES } from './constants';
import { initializeEvents, stopEvents } from './events';
import {
    apifyClient,
    addCharsetToContentType,
    sleep,
    snakeCaseToCamelCase,
    isAtHome,
    logSystemInfo,
    printOutdatedSdkWarning,
} from './utils';
import * as utils from './utils';
import { maybeStringify } from './storages/key_value_store';

// eslint-disable-next-line import/named,no-unused-vars,import/first
import { ActorRun } from './typedefs';
import { ApifyCallError } from './errors';

const METAMORPH_AFTER_SLEEP_MILLIS = 300000;

/**
 * Tries to parse a string with date.
 * Returns either a Date object or undefined
 *
 * @ignore
 */
const tryParseDate = (str) => {
    const unix = Date.parse(str);
    return unix > 0 ? new Date(unix) : undefined;
};

/**
 * Parsed representation of the `APIFY_XXX` environmental variables.
 * This object is returned by the {@link Apify#getEnv} function.
 *
 * @typedef ApifyEnv
 * @property {string|null} actorId ID of the actor (APIFY_ACTOR_ID)
 * @property {string|null} actorRunId ID of the actor run (APIFY_ACTOR_RUN_ID)
 * @property {string|null} actorTaskId ID of the actor task (APIFY_ACTOR_TASK_ID)
 * @property {string|null} userId ID of the user who started the actor - note that it might be
 *   different than the owner ofthe actor (APIFY_USER_ID)
 * @property {string|null} token Authentication token representing privileges given to the actor run,
 *   it can be passed to various Apify APIs (APIFY_TOKEN)
 * @property {Date|null} startedAt Date when the actor was started (APIFY_STARTED_AT)
 * @property {Date|null} timeoutAt Date when the actor will time out (APIFY_TIMEOUT_AT)
 * @property {string|null} defaultKeyValueStoreId ID of the key-value store where input and output data of this
 *   actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 * @property {string|null} defaultDatasetId ID of the dataset where input and output data of this
 *   actor is stored (APIFY_DEFAULT_DATASET_ID)
 * @property {number|null} memoryMbytes Amount of memory allocated for the actor,
 *   in megabytes (APIFY_MEMORY_MBYTES)
 */

/**
 * @typedef {Array<('ACTOR.RUN.SUCCEEDED' | 'ACTOR.RUN.ABORTED' | 'ACTOR.RUN.CREATED' | 'ACTOR.RUN.FAILED' | 'ACTOR.RUN.TIMED_OUT')>} EventTypes
 */

/**
 * Returns a new {@link ApifyEnv} object which contains information parsed from all the `APIFY_XXX` environment variables.
 *
 * For the list of the `APIFY_XXX` environment variables, see
 * [Actor documentation](https://docs.apify.com/actor/run#environment-variables).
 * If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.
 *
 * @memberof module:Apify
 * @function
 * @name getEnv
 * @returns {ApifyEnv}
 */
export const getEnv = () => {
    // NOTE: Don't throw if env vars are invalid to simplify local development and debugging of actors
    const env = process.env || {};
    const envVars = {};

    _.mapObject(ENV_VARS, (fullName, shortName) => {
        const camelCaseName = snakeCaseToCamelCase(shortName);
        let value = env[fullName];

        // Parse dates and integers.
        if (value && fullName.endsWith('_AT')) value = tryParseDate(value);
        else if (_.contains(INTEGER_ENV_VARS, fullName)) value = parseInt(value, 10);

        envVars[camelCaseName] = value || value === 0
            ? value
            : null;
    });

    return envVars;
};

/**
 * @callback UserFunc
 * @return {Promise<void>}
 */

/**
 * Runs the main user function that performs the job of the actor
 * and terminates the process when the user function finishes.
 *
 * **The `Apify.main()` function is optional** and is provided merely for your convenience.
 * It is mainly useful when you're running your code as an actor on the [Apify platform](https://apify.com/actors).
 * However, if you want to use Apify SDK tools directly inside your existing projects, e.g.
 * running in an [Express](https://expressjs.com/) server, on
 * [Google Cloud functions](https://cloud.google.com/functions)
 * or [AWS Lambda](https://aws.amazon.com/lambda/), it's better to avoid
 * it since the function terminates the main process when it finishes!
 *
 * The `Apify.main()` function performs the following actions:
 *
 * - When running on the Apify platform (i.e. <code>APIFY_IS_AT_HOME</code> environment variable is set),
 *   it sets up a connection to listen for platform events.
 *   For example, to get a notification about an imminent migration to another server.
 *   See {@link Apify.events} for details.
 * - It checks that either <code>APIFY_TOKEN</code> or <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable
 *   is defined. If not, the functions sets <code>APIFY_LOCAL_STORAGE_DIR</code> to <code>./apify_storage</code>
 *   inside the current working directory. This is to simplify running code examples.
 * - It invokes the user function passed as the <code>userFunc</code> parameter.
 * - If the user function returned a promise, waits for it to resolve.
 * - If the user function throws an exception or some other error is encountered,
 *   prints error details to console so that they are stored to the log.
 * - Exits the Node.js process, with zero exit code on success and non-zero on errors.
 *
 * The user function can be synchronous:
 *
 * ```javascript
 * Apify.main(() => {
 *   // My synchronous function that returns immediately
 *   console.log('Hello world from actor!');
 * });
 * ```
 *
 * If the user function returns a promise, it is considered asynchronous:
 * ```javascript
 * const { requestAsBrowser } = require('some-request-library');
 *
 * Apify.main(() => {
 *   // My asynchronous function that returns a promise
 *   return request('http://www.example.com').then((html) => {
 *     console.log(html);
 *   });
 * });
 * ```
 *
 * To simplify your code, you can take advantage of the `async`/`await` keywords:
 *
 * ```javascript
 * const request = require('some-request-library');
 *
 * Apify.main(async () => {
 *   // My asynchronous function
 *   const html = await request('http://www.example.com');
 *   console.log(html);
 * });
 * ```
 *
 * @param {UserFunc} userFunc User function to be executed. If it returns a promise,
 * the promise will be awaited. The user function is called with no arguments.
 *
 * @memberof module:Apify
 * @function
 * @name main
 */
export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error(`Apify.main() accepts a single parameter that must be a function (was '${userFunc === null ? 'null' : typeof (userFunc)}').`);
    }

    // Logging some basic system info (apify and apify-client version, NodeJS version, ...).
    logSystemInfo();

    // Log warning if SDK is outdated.
    printOutdatedSdkWarning();

    if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !process.env[ENV_VARS.TOKEN]) {
        const dir = path.join(process.cwd(), './apify_storage');
        process.env[ENV_VARS.LOCAL_STORAGE_DIR] = dir;
        log.warning(`Neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set, defaulting to ${ENV_VARS.LOCAL_STORAGE_DIR}="${dir}"`); // eslint-disable-line max-len
    }

    // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
    // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
    let exited = false;
    const exitWithError = (err, exitCode) => {
        log.exception(err);
        exited = true;
        // console.log(`Exiting with code: ${exitCode}`);
        process.exit(exitCode);
    };

    // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
    // await new Promise(() => {})
    // Such a construct is used for testing of actor timeouts and aborts.
    const intervalId = setInterval(_.noop, 9999999);

    // Using async here to have nice stack traces for errors
    const run = async () => {
        initializeEvents();
        try {
            await userFunc();

            stopEvents();
            clearInterval(intervalId);
            if (!exited) {
                process.exit(EXIT_CODES.SUCCESS);
            }
        } catch (err) {
            stopEvents();
            clearInterval(intervalId);
            if (!exited) {
                exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW);
            }
        }
    };

    run().catch((err) => {
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN);
    });
};

/**
 * @typedef AdhocWebhook
 * @property {EventTypes} eventTypes
 * @property {string} requestUrl
 * @property {string} [idempotencyKey]
 * @property {string} [payloadTemplate]
 */

/**
 * Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
 * waits for the actor to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an {@link ActorRun} object
 * that contains details about the actor run and its output (if any).
 * If the actor run fails, the function throws the {@link ApifyCallError} exception.
 *
 * If you want to run an actor task rather than an actor, please use the
 * {@link Apify#callTask} function instead.
 *
 * For more information about actors, read the
 * [documentation](https://docs.apify.com/actor).
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `call()` function invokes the
 * [Run actor](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor)
 * and several other API endpoints to obtain the output.
 *
 * @param {string} actId
 *  Allowed formats are `username/actor-name`, `userId/actor-name` or actor ID.
 * @param {Object<string, *>} [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param {object} [options]
 *   Object with the settings below:
 * @param {string} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {string} [options.token]
 *  User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {number} [options.memoryMbytes]
 *  Memory in megabytes which will be allocated for the new actor run.
 *  If not provided, the run uses memory of the default actor run configuration.
 * @param {number} [options.timeoutSecs]
 *  Timeout for the actor run in seconds. Zero value means there is no timeout.
 *  If not provided, the run uses timeout of the default actor run configuration.
 * @param {string} [options.build]
 *  Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @param {number} [options.waitSecs]
 *  Maximum time to wait for the actor run to finish, in seconds.
 *  If the limit is reached, the returned promise is resolved to a run object that will have
 *  status `READY` or `RUNNING` and it will not contain the actor run output.
 *  If `waitSecs` is null or undefined, the function waits for the actor to finish (default behavior).
 * @param {boolean} [options.fetchOutput=true]
 *  If `false` then the function does not fetch output of the actor.
 * @param {boolean} [options.disableBodyParser=false]
 *  If `true` then the function will not attempt to parse the
 *  actor's output and will return it in a raw `Buffer`.
 * @param {Array<AdhocWebhook>} [options.webhooks] Specifies optional webhooks associated with the actor run, which can be used
 *  to receive a notification e.g. when the actor finished or failed, see
 *  [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.
 * @returns {Promise<ActorRun>}
 * @throws {ApifyCallError} If the run did not succeed, e.g. if it failed or timed out.
 *
 * @memberof module:Apify
 * @function
 * @name call
 */
export const call = async (actId, input, options = {}) => {
    ow(actId, ow.string);
    // input can be anything, no reason to validate
    ow(options, ow.object.exactShape({
        contentType: ow.optional.string.nonEmpty,
        token: ow.optional.string,
        memoryMbytes: ow.optional.number.not.negative,
        timeoutSecs: ow.optional.number.not.negative,
        build: ow.optional.string,
        waitSecs: ow.optional.number.not.negative,
        fetchOutput: ow.optional.boolean,
        disableBodyParser: ow.optional.boolean,
        webhooks: ow.optional.array.ofType(ow.object),
    }));

    const {
        token,
        fetchOutput = true,
        disableBodyParser = false,
        memoryMbytes,
        timeoutSecs,
        ...callActorOpts
    } = options;

    callActorOpts.memory = memoryMbytes;
    callActorOpts.timeout = timeoutSecs;

    if (input) {
        callActorOpts.contentType = addCharsetToContentType(callActorOpts.contentType);
        input = maybeStringify(input, callActorOpts);
    }

    const client = token ? utils.newClient({ token }) : apifyClient;

    let run;
    try {
        run = await client.actor(actId).call(input, callActorOpts);
    } catch (err) {
        if (err.message.startsWith('Waiting for run to finish')) {
            throw new ApifyCallError({ id: run.id, actId: run.actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
        }
        throw err;
    }

    if (isRunUnsuccessful(run.status)) {
        const message = `The actor ${actId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${run.id}`;
        throw new ApifyCallError(run, message);
    }

    // Finish if output is not requested or run haven't finished.
    if (!fetchOutput || run.status !== ACT_JOB_STATUSES.SUCCEEDED) return run;

    // Fetch output.
    let getRecordOptions = {};
    if (disableBodyParser) getRecordOptions = { buffer: true };

    const { value: body, contentType } = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT', getRecordOptions);

    return { ...run, output: { contentType, body } };
};

/**
 * Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
 * waits for the task to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an {@link ActorRun} object
 * that contains details about the actor run and its output (if any).
 * If the actor run failed, the function fails with {@link ApifyCallError} exception.
 *
 * Note that an actor task is a saved input configuration and options for an actor.
 * If you want to run an actor directly rather than an actor task, please use the
 * {@link Apify#call} function instead.
 *
 * For more information about actor tasks, read the [documentation](https://docs.apify.com/tasks).
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.callTask('bob/some-task');
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `callTask()` function calls the
 * [Run task](https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task)
 * and several other API endpoints to obtain the output.
 *
 * @param {string} taskId
 *  Allowed formats are `username/task-name`, `userId/task-name` or task ID.
 * @param {Object<string, *>} [input]
 *  Input overrides for the actor task. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Provided input will be merged with actor task input.
 * @param {object} [options]
 *   Object with the settings below:
 * @param {string} [options.token]
 *  User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {number} [options.memoryMbytes]
 *  Memory in megabytes which will be allocated for the new actor task run.
 *  If not provided, the run uses memory of the default actor run configuration.
 * @param {number} [options.timeoutSecs]
 *  Timeout for the actor task run in seconds. Zero value means there is no timeout.
 *  If not provided, the run uses timeout of the default actor run configuration.
 * @param {string} [options.build]
 *  Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @param {number} [options.waitSecs]
 *  Maximum time to wait for the actor task run to finish, in seconds.
 *  If the limit is reached, the returned promise is resolved to a run object that will have
 *  status `READY` or `RUNNING` and it will not contain the actor run output.
 *  If `waitSecs` is null or undefined, the function waits for the actor task to finish (default behavior).
 * @param {Array<AdhocWebhook>} [options.webhooks] Specifies optional webhooks associated with the actor run, which can be used
 *  to receive a notification e.g. when the actor finished or failed, see
 *  [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.
 * @returns {Promise<ActorRun>}
 * @throws {ApifyCallError} If the run did not succeed, e.g. if it failed or timed out.
 *
 * @memberof module:Apify
 * @function
 * @name callTask
 */
export const callTask = async (taskId, input, options = {}) => {
    ow(taskId, ow.string);
    ow(input, ow.optional.any(ow.string, ow.object));
    ow(options, ow.object.exactShape({
        token: ow.optional.string,
        memoryMbytes: ow.optional.number.not.negative,
        timeoutSecs: ow.optional.number.not.negative,
        build: ow.optional.string,
        waitSecs: ow.optional.number.not.negative,
        fetchOutput: ow.optional.boolean,
        disableBodyParser: ow.optional.boolean,
        webhooks: ow.optional.array.ofType(ow.object),
    }));

    const {
        token,
        fetchOutput = true,
        disableBodyParser = false,
        memoryMbytes,
        timeoutSecs,
        ...callTaskOpts
    } = options;

    callTaskOpts.memory = memoryMbytes;
    callTaskOpts.timeout = timeoutSecs;

    const client = token ? utils.newClient({ token }) : apifyClient;
    // Start task and wait for run to finish if waitSecs is provided
    let run;
    try {
        run = await client.task(taskId).call(input, callTaskOpts);
    } catch (err) {
        if (err.message.startsWith('Waiting for run to finish')) {
            throw new ApifyCallError({ id: run.id, actId: run.actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
        }
        throw err;
    }

    if (isRunUnsuccessful(run.status)) {
        // TODO It should be callTask in the message, but I'm keeping it this way not to introduce a breaking change.
        const message = `The actor task ${taskId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${run.id}`;
        throw new ApifyCallError(run, message);
    }

    // Finish if output is not requested or run haven't finished.
    if (!fetchOutput || run.status !== ACT_JOB_STATUSES.SUCCEEDED) return run;

    // Fetch output.
    let getRecordOptions = {};
    if (disableBodyParser) getRecordOptions = { buffer: true };

    const { value: body, contentType } = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT', getRecordOptions);

    return { ...run, output: { contentType, body } };
};

function isRunUnsuccessful(status) {
    return status !== ACT_JOB_STATUSES.SUCCEEDED
        && status !== ACT_JOB_STATUSES.RUNNING
        && status !== ACT_JOB_STATUSES.READY;
}

/**
 * Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container
 * instead. All the default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.
 *
 * @param {string} targetActorId
 *  Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
 * @param {Object<string, *>} [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param {object} [options]
 *   Object with the settings below:
 * @param {string} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {string} [options.build]
 *  Tag or number of the target actor build to metamorph into (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @returns {Promise<void>}
 *
 * @memberof module:Apify
 * @function
 * @name metamorph
 */
export const metamorph = async (targetActorId, input, options = {}) => {
    ow(targetActorId, ow.string);
    // input can be anything, no reason to validate
    ow(options, ow.object.exactShape({
        contentType: ow.optional.string.nonEmpty,
        build: ow.optional.string,
        customAfterSleepMillis: ow.optional.number.not.negative,
    }));

    const {
        customAfterSleepMillis,
        ...metamorphOpts
    } = options;

    const actorId = process.env[ENV_VARS.ACTOR_ID];
    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!actorId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_ID} must be provided!`);
    if (!runId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} must be provided!`);

    if (input) {
        metamorphOpts.contentType = addCharsetToContentType(metamorphOpts.contentType);
        input = maybeStringify(input, metamorphOpts);
    }

    await utils.apifyClient.run(runId, actorId).metamorph(targetActorId, input, metamorphOpts);

    // Wait some time for container to be stopped.
    // NOTE: option.customAfterSleepMillis is used in tests
    await sleep(customAfterSleepMillis || METAMORPH_AFTER_SLEEP_MILLIS);
};

/**
 * @typedef WebhookRun
 * @property {string} id
 * @property {string} createdAt
 * @property {string} modifiedAt
 * @property {string} userId
 * @property {boolean} isAdHoc
 * @property {EventTypes} eventTypes
 * @property {*} condition
 * @property {boolean} ignoreSslErrors
 * @property {boolean} doNotRetry
 * @property {string} requestUrl
 * @property {string} payloadTemplate
 * @property {*} lastDispatch
 * @property {*} stats
 */
/**
 *
 * Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed.
 * For more information about Apify actor webhooks, please see the [documentation](https://docs.apify.com/webhooks).
 *
 * Note that webhooks are only supported for actors running on the Apify platform.
 * In local environment, the function will print a warning and have no effect.
 *
 * @param {object} options
 * @param {EventTypes} options.eventTypes
 *   Array of event types, which you can set for actor run, see
 *   the [actor run events](https://docs.apify.com/webhooks/events#actor-run) in the Apify doc.
 * @param {string}  options.requestUrl
 *   URL which will be requested using HTTP POST request, when actor run will reach the set event type.
 * @param {string} [options.payloadTemplate]
 *   Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
 *   It uses JSON syntax, extended with a double curly braces syntax for injecting variables `{{variable}}`.
 *   Those variables are resolved at the time of the webhook's dispatch, and a list of available variables with their descriptions
 *   is available in the [Apify webhook documentation](https://docs.apify.com/webhooks).
 *   If `payloadTemplate` is omitted, the default payload template is used
 *   ([view docs](https://docs.apify.com/webhooks/actions#payload-template)).
 * @param {string} [options.idempotencyKey]
 *   Idempotency key enables you to ensure that a webhook will not be added multiple times in case of
 *   an actor restart or other situation that would cause the `addWebhook()` function to be called again.
 *   We suggest using the actor run ID as the idempotency key. You can get the run ID by calling
 *   {@link Apify#getEnv} function.
 * @return {Promise<WebhookRun|undefined>} The return value is the Webhook object.
 * For more information, see the [Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.
 *
 * @memberof module:Apify
 * @function
 * @name addWebhook
 */
export const addWebhook = async (options) => {
    ow(options, ow.object.exactShape({
        eventTypes: ow.array.ofType(ow.string),
        requestUrl: ow.string,
        payloadTemplate: ow.optional.string,
        idempotencyKey: ow.optional.string,
    }));

    const { eventTypes, requestUrl, payloadTemplate, idempotencyKey } = options;

    if (!isAtHome()) {
        log.warning('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
        return;
    }

    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!runId) {
        throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} is not set!`);
    }

    return apifyClient.webhooks().create({
        isAdHoc: true,
        eventTypes,
        condition: {
            actorRunId: runId,
        },
        requestUrl,
        payloadTemplate,
        idempotencyKey,
    });
};

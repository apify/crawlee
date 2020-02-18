import path from 'path';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { ENV_VARS, INTEGER_ENV_VARS, LOCAL_ENV_VARS, ACT_JOB_TERMINAL_STATUSES, ACT_JOB_STATUSES } from 'apify-shared/consts';
import { EXIT_CODES, COUNTRY_CODE_REGEX } from './constants';
import { initializeEvents, stopEvents } from './events';
import { apifyClient, addCharsetToContentType, sleep, snakeCaseToCamelCase, isAtHome, logSystemInfo, printOutdatedSdkWarning } from './utils';
import { maybeStringify } from './key_value_store';
import { ApifyCallError } from './errors';

// TYPE IMPORTS
/* eslint-disable no-unused-vars,import/named,import/no-duplicates,import/order */
import { ActorRun } from './typedefs';
/* eslint-enable no-unused-vars,import/named,import/no-duplicates,import/order */

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
 * Waits for given run to finish. If "waitSecs" is reached then returns unfinished run.
 *
 * @ignore
 */
const waitForRunToFinish = async ({ actId, runId, token, waitSecs, taskId }) => {
    let updatedRun;

    const { acts } = apifyClient;
    const startedAt = Date.now();
    const shouldRepeat = () => {
        if (waitSecs && (Date.now() - startedAt) / 1000 >= waitSecs) return false;
        if (updatedRun && ACT_JOB_TERMINAL_STATUSES.includes(updatedRun.status)) return false;

        return true;
    };

    const getRunOpts = { actId, runId };
    if (token) getRunOpts.token = token;

    while (shouldRepeat()) {
        getRunOpts.waitForFinish = waitSecs
            ? Math.round(waitSecs - (Date.now() - startedAt) / 1000)
            : 999999;

        updatedRun = await acts.getRun(getRunOpts);

        // It might take some time for database replicas to get up-to-date,
        // so getRun() might return null. Wait a little bit and try it again.
        if (!updatedRun) await sleep(250);
    }

    if (!updatedRun) {
        throw new ApifyCallError({ id: runId, actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
    }
    const { status } = updatedRun;
    if (
        status !== ACT_JOB_STATUSES.SUCCEEDED
        && status !== ACT_JOB_STATUSES.RUNNING
        && status !== ACT_JOB_STATUSES.READY
    ) {
        const message = taskId
            ? `The actor task ${taskId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${runId}`
            : `The actor ${actId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${runId}`;
        throw new ApifyCallError(updatedRun, message);
    }

    return updatedRun;
};

/**
 * Parses input and contentType and appends it to a given options object.
 * Throws if input is not valid.
 *
 * @ignore
 */
const addInputOptionsOrThrow = (input, contentType, options) => {
    options.contentType = contentType;

    // NOTE: this function modifies contentType property on options object if needed.
    options.body = maybeStringify(input, options);

    checkParamOrThrow(options.body, 'input', 'Buffer|String');
    checkParamOrThrow(options.contentType, 'contentType', 'String');

    options.contentType = addCharsetToContentType(options.contentType);
};

/**
 * Parsed representation of the `APIFY_XXX` environmental variables.
 *
 * @typedef {Object} ApifyEnv
 * @property {String|null} actorId ID of the actor (APIFY_ACTOR_ID)
 * @property {String|null} actorRunId ID of the actor run (APIFY_ACTOR_RUN_ID)
 * @property {String|null} actorTaskId ID of the actor task (APIFY_ACTOR_TASK_ID)
 * @property {String|null} userId ID of the user who started the actor - note that it might be
 *   different than the owner ofthe actor (APIFY_USER_ID)
 * @property {String|null} token Authentication token representing privileges given to the actor run,
 *   it can be passed to various Apify APIs (APIFY_TOKEN)
 * @property {Date|null} startedAt Date when the actor was started (APIFY_STARTED_AT)
 * @property {Date|null} timeoutAt Date when the actor will time out (APIFY_TIMEOUT_AT)
 * @property {String|null} defaultKeyValueStoreId ID of the key-value store where input and output data of this
 *   actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 * @property {String|null} defaultDatasetId ID of the dataset where input and output data of this
 *   actor is stored (APIFY_DEFAULT_DATASET_ID)
 * @property {Number|null} memoryMbytes Amount of memory allocated for the actor,
 *   in megabytes (APIFY_MEMORY_MBYTES)
 */

/**
 * Returns a new {@link ApifyEnv} object which contains information parsed from all the `APIFY_XXX` environment variables.
 *
 * For the list of the `APIFY_XXX` environment variables, see
 * <a href="https://docs.apify.com/actor/run#environment-variables" target="_blank">Actor documentation</a>.
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
 * <ol>
 *   <li>When running on the Apify platform (i.e. <code>APIFY_IS_AT_HOME</code> environment variable is set),
 *   it sets up a connection to listen for platform events.
 *   For example, to get a notification about an imminent migration to another server.
 *   See <a href="apify#apifyevents"><code>Apify.events</code></a> for details.
 *   </li>
 *   <li>It checks that either <code>APIFY_TOKEN</code> or <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable
 *   is defined. If not, the functions sets <code>APIFY_LOCAL_STORAGE_DIR</code> to <code>./apify_storage</code>
 *   inside the current working directory. This is to simplify running code examples.
 *   </li>
 *   <li>It invokes the user function passed as the <code>userFunc</code> parameter.</li>
 *   <li>If the user function returned a promise, waits for it to resolve.</li>
 *   <li>If the user function throws an exception or some other error is encountered,
 *       prints error details to console so that they are stored to the log.</li>
 *   <li>Exits the Node.js process, with zero exit code on success and non-zero on errors.</li>
 * </ol>
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
 * const request = require('request-promise-native');
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
 * const request = require('request-promise-native');
 *
 * Apify.main(async () => {
 *   // My asynchronous function
 *   const html = await request('http://www.example.com');
 *   console.log(html);
 * });
 * ```
 *
 * @param {Function} userFunc User function to be executed. If it returns a promise,
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
    const exitWithError = (err, exitCode, message) => {
        log.exception(err, message);
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
                exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW, 'The function passed to Apify.main() threw an exception:');
            }
        }
    };

    run().catch((err) => {
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN, 'Unknown error occurred');
    });
};

let callMemoryWarningIssued = false;


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
 * [`Apify.callTask()`](../api/apify#module_Apify.callTask) function instead.
 *
 * For more information about actors, read the
 * <a href="https://docs.apify.com/actor" target="_blank">documentation</a>.
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `call()` function invokes the
 * <a href="https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Run actor</a>
 * and several other API endpoints to obtain the output.
 *
 * @param {String} actId
 *  Either `username/actor-name` or actor ID.
 * @param {Object|String|Buffer} [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param {Object} [options]
 *   Object with the settings below:
 * @param {String} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {String} [options.token]
 *  User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {Number} [options.memoryMbytes]
 *  Memory in megabytes which will be allocated for the new actor run.
 *  If not provided, the run uses memory of the default actor run configuration.
 * @param {Number} [options.timeoutSecs]
 *  Timeout for the actor run in seconds. Zero value means there is no timeout.
 *  If not provided, the run uses timeout of the default actor run configuration.
 * @param {String} [options.build]
 *  Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @param {String} [options.waitSecs]
 *  Maximum time to wait for the actor run to finish, in seconds.
 *  If the limit is reached, the returned promise is resolved to a run object that will have
 *  status `READY` or `RUNNING` and it will not contain the actor run output.
 *  If `waitSecs` is null or undefined, the function waits for the actor to finish (default behavior).
 * @param {Boolean} [options.fetchOutput=true]
 *  If `false` then the function does not fetch output of the actor.
 * @param {Boolean} [options.disableBodyParser=false]
 *  If `true` then the function will not attempt to parse the
 *  actor's output and will return it in a raw `Buffer`.
 * @param {Array} [options.webhooks] Specifies optional webhooks associated with the actor run, which can be used
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
    const { acts, keyValueStores } = apifyClient;

    checkParamOrThrow(actId, 'actId', 'String');
    checkParamOrThrow(options, 'opts', 'Object');

    // Common options.
    const { token } = options;
    checkParamOrThrow(token, 'token', 'Maybe String');

    // RunAct() options.
    const { build, memory, timeoutSecs, webhooks } = options;
    let { memoryMbytes } = options;
    const runActOpts = {
        actId,
    };

    // HOTFIX: Some old actors use "memory", so we need to keep them working for a while
    if (memory && !memoryMbytes) {
        memoryMbytes = memory;
        if (!callMemoryWarningIssued) {
            callMemoryWarningIssued = true;
            // eslint-disable-next-line max-len
            log.warning('The "memory" option of the Apify.call() function has been deprecated and will be removed in the future. Use "memoryMbytes" instead!');
        }
    }

    checkParamOrThrow(build, 'build', 'Maybe String');
    checkParamOrThrow(memoryMbytes, 'memoryMbytes', 'Maybe Number');
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Maybe Number');
    checkParamOrThrow(webhooks, 'webhooks', 'Maybe Array');
    if (token) runActOpts.token = token;
    if (build) runActOpts.build = build;
    if (memoryMbytes) runActOpts.memory = memoryMbytes;
    if (timeoutSecs >= 0) runActOpts.timeout = timeoutSecs; // Zero is valid value!
    if (webhooks) runActOpts.webhooks = webhooks;
    if (input) addInputOptionsOrThrow(input, options.contentType, runActOpts);

    // Run actor.
    const { waitSecs } = options;
    checkParamOrThrow(waitSecs, 'waitSecs', 'Maybe Number');
    const run = await acts.runAct(runActOpts);
    if (waitSecs <= 0) return run; // In this case there is nothing more to do.

    // Wait for run to finish.
    const updatedRun = await waitForRunToFinish({
        actId,
        runId: run.id,
        token,
        waitSecs,
    });

    // Finish if output is not requested or run haven't finished.
    const { fetchOutput = true } = options;
    if (!fetchOutput || updatedRun.status !== ACT_JOB_STATUSES.SUCCEEDED) return updatedRun;

    // Fetch output.
    const { disableBodyParser = false } = options;
    checkParamOrThrow(disableBodyParser, 'disableBodyParser', 'Boolean');
    const output = await keyValueStores.getRecord({
        key: 'OUTPUT',
        storeId: updatedRun.defaultKeyValueStoreId,
        disableBodyParser,
    });

    return Object.assign({}, updatedRun, { output });
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
 * [`Apify.call()`](../api/apify#module_Apify.call) function instead.
 *
 * For more information about actor tasks, read the [`documentation`](https://docs.apify.com/tasks).
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.callTask('bob/some-task');
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `callTask()` function calls the
 * <a href="https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task" target="_blank">Run task</a>
 * and several other API endpoints to obtain the output.
 *
 * @param {String} taskId
 *  Either `username/task-name` or task ID.
 * @param {Object|String|Buffer} [input]
 *  Input overrides for the actor task. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 *  Provided input will be merged with actor task input.
 * @param {Object} [options]
 *   Object with the settings below:
 * @param {String} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {String} [options.token]
 *  User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {Number} [options.memoryMbytes]
 *  Memory in megabytes which will be allocated for the new actor task run.
 *  If not provided, the run uses memory of the default actor run configuration.
 * @param {Number} [options.timeoutSecs]
 *  Timeout for the actor task run in seconds. Zero value means there is no timeout.
 *  If not provided, the run uses timeout of the default actor run configuration.
 * @param {String} [options.build]
 *  Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @param {String} [options.waitSecs]
 *  Maximum time to wait for the actor task run to finish, in seconds.
 *  If the limit is reached, the returned promise is resolved to a run object that will have
 *  status `READY` or `RUNNING` and it will not contain the actor run output.
 *  If `waitSecs` is null or undefined, the function waits for the actor task to finish (default behavior).
 * @param {Array} [options.webhooks] Specifies optional webhooks associated with the actor run, which can be used
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
    const { tasks, keyValueStores } = apifyClient;

    checkParamOrThrow(taskId, 'taskId', 'String');
    checkParamOrThrow(options, 'opts', 'Object');

    // Common options.
    const { token } = options;
    checkParamOrThrow(token, 'token', 'Maybe String');

    // Run task options.
    const { build, memoryMbytes, timeoutSecs, webhooks } = options;
    const runTaskOpts = { taskId };
    checkParamOrThrow(build, 'build', 'Maybe String');
    checkParamOrThrow(memoryMbytes, 'memoryMbytes', 'Maybe Number');
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Maybe Number');
    checkParamOrThrow(webhooks, 'webhooks', 'Maybe Array');
    if (token) runTaskOpts.token = token;
    if (build) runTaskOpts.build = build;
    if (memoryMbytes) runTaskOpts.memory = memoryMbytes;
    if (timeoutSecs >= 0) runTaskOpts.timeout = timeoutSecs; // Zero is valid value!
    if (input) runTaskOpts.input = input;
    if (webhooks) runTaskOpts.webhooks = webhooks;

    // Start task.
    const { waitSecs } = options;
    checkParamOrThrow(waitSecs, 'waitSecs', 'Maybe Number');
    const run = await tasks.runTask(runTaskOpts);
    if (waitSecs <= 0) return run; // In this case there is nothing more to do.

    // Wait for run to finish.
    const updatedRun = await waitForRunToFinish({
        actId: run.actId,
        runId: run.id,
        token,
        waitSecs,
        taskId,
    });

    // Finish if output is not requested or run haven't finished.
    const { fetchOutput = true } = options;
    if (!fetchOutput || updatedRun.status !== ACT_JOB_STATUSES.SUCCEEDED) return updatedRun;

    // Fetch output.
    const { disableBodyParser = false } = options;
    checkParamOrThrow(disableBodyParser, 'disableBodyParser', 'Boolean');
    const output = await keyValueStores.getRecord({
        key: 'OUTPUT',
        storeId: updatedRun.defaultKeyValueStoreId,
        disableBodyParser,
    });

    return Object.assign({}, updatedRun, { output });
};


/**
 * Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container
 * instead. All the default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.
 *
 * @param {String} targetActorId
 *  Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
 * @param {Object|String|Buffer} [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param {Object} [options]
 *   Object with the settings below:
 * @param {String} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {String} [options.build]
 *  Tag or number of the target actor build to metamorph into (e.g. `beta` or `1.2.345`).
 *  If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
 * @returns {Promise<void>}
 *
 * @memberof module:Apify
 * @function
 * @name metamorph
 */
export const metamorph = async (targetActorId, input, options = {}) => {
    // Use optionsCopy here as maybeStringify() may override contentType
    const optionsCopy = Object.assign({}, options);
    const { acts } = apifyClient;

    checkParamOrThrow(targetActorId, 'targetActorId', 'String');
    checkParamOrThrow(optionsCopy, 'opts', 'Object');
    checkParamOrThrow(optionsCopy.build, 'options.build', 'Maybe String');
    checkParamOrThrow(optionsCopy.contentType, 'options.contentType', 'Maybe String');

    const actorId = process.env[ENV_VARS.ACTOR_ID];
    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!actorId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_ID} must be provided!`);
    if (!runId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} must be provided!`);

    if (input) {
        input = maybeStringify(input, optionsCopy);
        checkParamOrThrow(input, 'input', 'Buffer|String');
        if (optionsCopy.contentType) optionsCopy.contentType = addCharsetToContentType(optionsCopy.contentType);
    }

    await acts.metamorphRun({
        actId: actorId,
        runId,
        targetActorId,
        contentType: optionsCopy.contentType,
        body: input,
        build: optionsCopy.build,
    });

    // Wait some time for container to be stopped.
    // NOTE: option.customAfterSleepMillis is used in tests
    await sleep(optionsCopy.customAfterSleepMillis || METAMORPH_AFTER_SLEEP_MILLIS);
};

/**
 * Constructs an Apify Proxy URL using the specified settings.
 * The proxy URL can be used from Apify actors, web browsers or any other HTTP
 * proxy-enabled applications.
 *
 * For more information, see
 * the <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> page in the app
 * or the <a href="https://docs.apify.com/proxy" target="_blank">documentation</a>.
 *
 * @param {Object} options
 *   Object with the settings below:
 * @param {String} [options.password] User's password for the proxy.
 *   By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable,
 *   which is automatically set by the system when running the actors on the Apify cloud,
 *   or when using the <a href="https://github.com/apifytech/apify-cli" target="_blank">Apify CLI</a>
 *   package and the user previously logged in (called `apify login`).
 * @param {String[]} [options.groups] Array of Apify Proxy groups to be used.
 *   If not provided, the proxy will select the groups automatically.
 * @param {String} [options.session] Apify Proxy session identifier to be used by the Chrome browser.
 *   All HTTP requests going through the proxy with the same session identifier
 *   will use the same target proxy server (i.e. the same IP address), unless using Residential proxies.
 *   The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 * @param {String} [options.country] If specified, all proxied requests will use IP addresses that are geolocated to the specified country.
 * For example `GB` for IPs from Great Britain. Note that online services often have their own rules for handling geolocation and thus
 * the country selection is a best attempt at geolocation, rather than a guaranteed hit.
 * This parameter is optional, by default, each proxied request is assigned an IP address from a random country.
 * The country code needs to be a two letter ISO country code
 * \- see the <a href="https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements" target="_blank">
 * full list of available country codes
 * </a>.
 *
 * This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
 *
 * @returns {String} Returns the proxy URL, e.g. `http://auto:my_password@proxy.apify.com:8000`.
 *
 * @memberof module:Apify
 * @function
 * @name getApifyProxyUrl
 */
export const getApifyProxyUrl = (options = {}) => {
    // For backwards compatibility.
    // TODO: remove this when we release v1.0.0
    if (!options.groups && options.apifyProxyGroups) {
        log.warning('Parameter `apifyProxyGroups` of Apify.getApifyProxyUrl() is deprecated!!! Use `groups` instead!');
        options.groups = options.apifyProxyGroups;
    }
    if (!options.session && options.apifyProxySession) {
        log.warning('Parameter `apifyProxySession` of Apify.getApifyProxyUrl() is deprecated!!! Use `session` instead!');
        options.session = options.apifyProxySession;
    }

    const {
        groups,
        session,
        country,
        password = process.env[ENV_VARS.PROXY_PASSWORD],
        hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
        port = parseInt(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT], 10),

        // This is used only internaly. Some other function calling this function use different naming for groups and session
        // parameters so we need to override this in error messages.
        groupsParamName = 'opts.groups',
        sessionParamName = 'opts.session',
        countryParamName = 'opts.country',
    } = options;

    const getMissingParamErrorMgs = (param, env) => `Apify Proxy ${param} must be provided as parameter or "${env}" environment variable!`;
    const throwInvalidProxyValueError = (param) => {
        throw new Error(`The "${param}" option can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
    };
    const throwInvalidCountryCode = (code) => {
        throw new Error(`The "${code}" option must be a valid two letter country code according to ISO 3166-1 alpha-2`);
    };

    checkParamOrThrow(groups, groupsParamName, 'Maybe [String]');
    checkParamOrThrow(session, sessionParamName, 'Maybe Number | String');
    checkParamOrThrow(country, countryParamName, 'Maybe String');
    checkParamOrThrow(password, 'opts.password', 'String', getMissingParamErrorMgs('password', ENV_VARS.PROXY_PASSWORD));
    checkParamOrThrow(hostname, 'opts.hostname', 'String', getMissingParamErrorMgs('hostname', ENV_VARS.PROXY_HOSTNAME));
    checkParamOrThrow(port, 'opts.port', 'Number', getMissingParamErrorMgs('port', ENV_VARS.PROXY_PORT));

    let username;

    if (groups || session || country) {
        const parts = [];

        if (groups && groups.length) {
            if (!groups.every(group => APIFY_PROXY_VALUE_REGEX.test(group))) throwInvalidProxyValueError('groups');
            parts.push(`groups-${groups.join('+')}`);
        }
        if (session) {
            if (!APIFY_PROXY_VALUE_REGEX.test(session)) throwInvalidProxyValueError('session');
            parts.push(`session-${session}`);
        }
        if (country) {
            if (!COUNTRY_CODE_REGEX.test(country)) throwInvalidCountryCode(country);
            parts.push(`country-${country}`);
        }

        username = parts.join(',');
    } else {
        username = 'auto';
    }

    return `http://${username}:${password}@${hostname}:${port}`;
};

/**
 *
 * Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed.
 * For more information about Apify actor webhooks, please see the <a href="https://docs.apify.com/webhooks" target="_blank">documentation</a>.
 *
 * Note that webhooks are only supported for actors running on the Apify platform.
 * In local environment, the function will print a warning and have no effect.
 *
 * @param {Object} options
 * @param {string[]} options.eventTypes
 *   Array of event types, which you can set for actor run, see
 *   the <a href="https://docs.apify.com/webhooks/events#actor-run" target="_blank">actor run events</a> in the Apify doc.
 * @param {string}  options.requestUrl
 *   URL which will be requested using HTTP POST request, when actor run will reach the set event type.
 * @param {string} [options.payloadTemplate]
 *   Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
 *   It uses JSON syntax, extended with a double curly braces syntax for injecting variables `{{variable}}`.
 *   Those variables are resolved at the time of the webhook's dispatch, and a list of available variables with their descriptions
 *   is available in the <a href="https://docs.apify.com/webhooks" target="_blank">Apify webhook documentation</a>.
 *
 *   When omitted, the default payload template will be used.
 *   <a href="https://docs.apify.com/webhooks" target="_blank">See the docs for the default payload template</a>.
 * @param {string} [options.idempotencyKey]
 *   Idempotency key enables you to ensure that a webhook will not be added multiple times in case of
 *   an actor restart or other situation that would cause the `addWebhook()` function to be called again.
 *   We suggest using the actor run ID as the idempotency key. You can get the run ID by calling
 *   [`Apify.getEnv()`](apify#module_Apify.getEnv) function.
 * @return {Promise<Object>} The return value is the Webhook object.
 * For more information, see the [Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.
 *
 * @memberof module:Apify
 * @function
 * @name addWebhook
 */
export const addWebhook = async ({ eventTypes, requestUrl, payloadTemplate, idempotencyKey }) => {
    checkParamOrThrow(eventTypes, 'eventTypes', '[String]');
    checkParamOrThrow(requestUrl, 'requestUrl', 'String');
    checkParamOrThrow(payloadTemplate, 'payloadTemplate', 'Maybe String');

    if (!isAtHome()) {
        log.warning('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
        return;
    }

    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!runId) {
        throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} is not set!`);
    }

    return apifyClient.webhooks.createWebhook({
        webhook: {
            isAdHoc: true,
            eventTypes,
            condition: {
                actorRunId: runId,
            },
            requestUrl,
            payloadTemplate,
            idempotencyKey,
        },
    });
};

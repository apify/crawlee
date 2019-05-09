import path from 'path';
import _ from 'underscore';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { ENV_VARS, INTEGER_ENV_VARS, LOCAL_ENV_VARS, ACT_JOB_TERMINAL_STATUSES, ACT_JOB_STATUSES } from 'apify-shared/consts';
import { EXIT_CODES } from './constants';
import { initializeEvents, stopEvents } from './events';
import { apifyClient, addCharsetToContentType, sleep, snakeCaseToCamelCase, isAtHome } from './utils';
import { maybeStringify } from './key_value_store';
import { ApifyCallError } from './errors';

/* globals process */

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
            ? `The actor task ${taskId} invoked by Apify.call() did not succeed`
            : `The actor ${actId} invoked by Apify.call() did not succeed`;
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
 * Returns a new object which contains information parsed from the `APIFY_XXX` environment variables.
 * It has the following properties:
 *
 * ```javascript
 * {
 *     // ID of the actor (APIFY_ACT_ID)
 *     actId: String,
 *     // ID of the actor run (APIFY_ACT_RUN_ID)
 *     actRunId: String,
 *     // ID of the user who started the actor - note that it might be
 *     // different than the owner of the actor (APIFY_USER_ID)
 *     userId: String,
 *     // Authentication token representing privileges given to the actor run,
 *     // it can be passed to various Apify APIs (APIFY_TOKEN).
 *     token: String,
 *     // Date when the actor was started (APIFY_STARTED_AT)
 *     startedAt: Date,
 *     // Date when the actor will time out (APIFY_TIMEOUT_AT)
 *     timeoutAt: Date,
 *     // ID of the key-value store where input and output data of this
 *     // actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 *     defaultKeyValueStoreId: String,
 *     // ID of the dataset where input and output data of this
 *     // actor is stored (APIFY_DEFAULT_DATASET_ID)
 *     defaultDatasetId: String,
 *     // Amount of memory allocated for the actor,
 *     // in megabytes (APIFY_MEMORY_MBYTES)
 *     memoryMbytes: Number,
 * }
 * ```
 * For the list of the `APIFY_XXX` environment variables, see
 * <a href="https://apify.com/docs/actor#run-env-vars" target="_blank">Actor documentation</a>.
 * If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.
 *
 * @returns {Object}
 *
 * @memberof module:Apify
 * @function
 * @name getEnv
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
 * Runs the main user function that performs the job of the actor.
 *
 * `Apify.main()` is especially useful when you're running your code in an actor on the Apify platform.
 * Note that its use is optional - the function is provided merely for your convenience.
 *
 * The function performs the following actions:
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
 * <a href="https://apify.com/docs/actor" target="_blank">documentation</a>.
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
    const { build, memory, timeoutSecs } = options;
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
    if (token) runActOpts.token = token;
    if (build) runActOpts.build = build;
    if (memoryMbytes) runActOpts.memory = memoryMbytes;
    if (timeoutSecs >= 0) runActOpts.timeout = timeoutSecs; // Zero is valid value!
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
 * For more information about actor tasks, read the [`documentation`](https://apify.com/docs/tasks).
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
    const { build, memoryMbytes, timeoutSecs } = options;
    const runTaskOpts = { taskId };
    checkParamOrThrow(build, 'build', 'Maybe String');
    checkParamOrThrow(memoryMbytes, 'memoryMbytes', 'Maybe Number');
    checkParamOrThrow(timeoutSecs, 'timeoutSecs', 'Maybe Number');
    if (token) runTaskOpts.token = token;
    if (build) runTaskOpts.build = build;
    if (memoryMbytes) runTaskOpts.memory = memoryMbytes;
    if (timeoutSecs >= 0) runTaskOpts.timeout = timeoutSecs; // Zero is valid value!
    if (input) addInputOptionsOrThrow(input, options.contentType, runTaskOpts);

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
 * @returns {Promise<undefined>}
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
 * Represents information about an actor run, as returned by the
 * [`Apify.call()`](../api/apify#module_Apify.call) or [`Apify.callTask()`](../api/apify#module_Apify.callTask) function.
 * The object is almost equivalent to the JSON response
 * of the
 * <a href="https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Actor run</a>
 * Apify API endpoint and extended with certain fields.
 * For more details, see
 * <a href="https://apify.com/docs/actor#run" target="_blank">Runs.</a>
 *
 * @typedef {Object} ActorRun
 * @property {String} id
 *   Actor run ID
 * @property {String} actId
 *   Actor ID
 * @property {Date} startedAt
 *   Time when the actor run started
 * @property {Date} finishedAt
 *   Time when the actor run finished. Contains `null` for running actors.
 * @property {String} status
 *   Status of the run. For possible values, see
 *   <a href="https://apify.com/docs/actor#run-lifecycle" target="_blank">Run lifecycle</a>
 *   in Apify actor documentation.
 * @property {Object} meta
 *   Actor run meta-data. For example:
 *   ```
 *   {
 *     "origin": "API",
 *     "clientIp": "1.2.3.4",
 *     "userAgent": "ApifyClient/0.2.13 (Linux; Node/v8.11.3)"
 *   }
 *   ```
 * @property {Object} stats
 *   An object containing various actor run statistics. For example:
 *   ```
 *   {
 *     "inputBodyLen": 22,
 *     "restartCount": 0,
 *     "workersUsed": 1,
 *   }
 *   ```
 *   Beware that object fields might change in future releases.
 * @property {Object} options
 *   Actor run options. For example:
 *   ```
 *   {
 *     "build": "latest",
 *     "waitSecs": 0,
 *     "memoryMbytes": 256,
 *     "diskMbytes": 512
 *   }
 *   ```
 * @property {String} buildId
 *   ID of the actor build used for the run. For details, see
 *   <a href="https://apify.com/docs/actor#build" target="_blank">Builds</a>
 *   in Apify actor documentation.
 * @property {String} buildNumber
 *   Number of the actor build used for the run. For example, `0.0.10`.
 * @property {Number} exitCode
 *   Exit code of the actor run process. It's `null` if actor is still running.
 * @property {String} defaultKeyValueStoreId
 *   ID of the default key-value store associated with the actor run. See [`KeyValueStore`](../api/keyvaluestore) for details.
 * @property {String} defaultDatasetId
 *   ID of the default dataset associated with the actor run. See [`Dataset`](../api/dataset) for details.
 * @property {String} defaultRequestQueueId
 *   ID of the default request queue associated with the actor run. See [`RequestQueue`](../api/requestqueue) for details.
 * @property {String} containerUrl
 *   URL on which the web server running inside actor run's Docker container can be accessed.
 *   For more details, see
 *   <a href="https://apify.com/docs/actor#container-web-server" target="_blank">Container web server</a>
 *   in Apify actor documentation.
 * @property {Object} output
 *   Contains output of the actor run. The value is `null` or `undefined` in case the actor is still running,
 *   or if you pass `false` to the `fetchOutput` option of [`Apify.call()`](../api/apify#module_Apify.call).
 *
 *   For example:
 *   ```
 *   {
 *     "contentType": "application/json; charset=utf-8",
 *     "body": {
 *       "message": "Hello world!"
 *     }
 *   }
 *   ```
 */


/**
 * Constructs an Apify Proxy URL using the specified settings.
 * The proxy URL can be used from Apify actors, web browsers or any other HTTP
 * proxy-enabled applications.
 *
 * For more information, see
 * the <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> page in the app
 * or the <a href="https://apify.com/docs/proxy" target="_blank">documentation</a>.
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
        password = process.env[ENV_VARS.PROXY_PASSWORD],
        hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME],
        port = parseInt(process.env[ENV_VARS.PROXY_PORT] || LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT], 10),

        // This is used only internaly. Some other function calling this function use different naming for groups and session
        // parameters so we need to override this in error messages.
        groupsParamName = 'opts.groups',
        sessionParamName = 'opts.session',
    } = options;

    const getMissingParamErrorMgs = (param, env) => `Apify Proxy ${param} must be provided as parameter or "${env}" environment variable!`;
    const throwInvalidProxyValueError = (param) => {
        throw new Error(`The "${param}" option can only contain the following characters: 0-9, a-z, A-Z, ".", "_" and "~"`);
    };

    checkParamOrThrow(groups, groupsParamName, 'Maybe [String]');
    checkParamOrThrow(session, sessionParamName, 'Maybe Number | String');
    checkParamOrThrow(password, 'opts.password', 'String', getMissingParamErrorMgs('password', ENV_VARS.PROXY_PASSWORD));
    checkParamOrThrow(hostname, 'opts.hostname', 'String', getMissingParamErrorMgs('hostname', ENV_VARS.PROXY_HOSTNAME));
    checkParamOrThrow(port, 'opts.port', 'Number', getMissingParamErrorMgs('port', ENV_VARS.PROXY_PORT));

    let username;

    if (groups || session) {
        const parts = [];

        if (groups && groups.length) {
            if (!groups.every(group => APIFY_PROXY_VALUE_REGEX.test(group))) throwInvalidProxyValueError('groups');
            parts.push(`groups-${groups.join('+')}`);
        }
        if (session) {
            if (!APIFY_PROXY_VALUE_REGEX.test(session)) throwInvalidProxyValueError('session');
            parts.push(`session-${session}`);
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
 * For more information about Apify actor webhooks, please see the <a href="https://apify.com/docs/webhook" target="_blank">documentation</a>.
 *
 * Note that webhooks are only supported for actors running on the Apify platform.
 * In local environment, the function will print a warning and have no effect.
 *
 * @param options.eventTypes {String[]} - Array of event types, which you can set for actor run, see
 * the <a href="https://apify.com/docs/webhooks#events-actor-run" target="_blank">actor run events</a> in the Apify doc.
 * @param options.requestUrl {String} - URL which will be requested using HTTP POST request, when actor run will be in specific event type.
 *
 * @return {Promise<Object|undefined>}
 *
 * @memberof module:Apify
 * @function
 * @name addWebhook
 */
export const addWebhook = async ({ eventTypes, requestUrl }) => {
    checkParamOrThrow(eventTypes, 'eventTypes', '[String]');
    checkParamOrThrow(requestUrl, 'requestUrl', 'String');

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
        },
    });
};

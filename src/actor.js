import _ from 'underscore';
import Promise from 'bluebird';
import fs from 'fs';
import log from 'apify-shared/log';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { APIFY_PROXY_VALUE_REGEX } from 'apify-shared/regexs';
import { ENV_VARS, EXIT_CODES, ACT_TASK_TERMINAL_STATUSES, ACT_TASK_STATUSES, DEFAULT_PROXY_HOSTNAME, DEFAULT_PROXY_PORT } from './constants';
import { initializeEvents, stopEvents } from './events';
import { newPromise, apifyClient, addCharsetToContentType } from './utils';
import { maybeStringify } from './key_value_store';
import { ApifyCallError } from './errors';

/* globals process */

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
 * Returns a new object which contains information parsed from the `APIFY_XXX` environment variables.
 * It has the following properties:
 *
 * ```javascript
 * {
 *     // ID of the actor (APIFY_ACT_ID)
 *     actId: String,
 * &nbsp;
 *     // ID of the actor run (APIFY_ACT_RUN_ID)
 *     actRunId: String,
 * &nbsp;
 *     // ID of the user who started the actor - note that it might be
 *     // different than the owner of the actor (APIFY_USER_ID)
 *     userId: String,
 * &nbsp;
 *     // Authentication token representing privileges given to the actor run,
 *     // it can be passed to various Apify APIs (APIFY_TOKEN).
 *     token: String,
 * &nbsp;
 *     // Date when the actor was started (APIFY_STARTED_AT)
 *     startedAt: Date,
 * &nbsp;
 *     // Date when the actor will time out (APIFY_TIMEOUT_AT)
 *     timeoutAt: Date,
 * &nbsp;
 *     // ID of the key-value store where input and output data of this
 *     // actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 *     defaultKeyValueStoreId: String,
 * &nbsp;
 *     // ID of the dataset where input and output data of this
 *     // actor is stored (APIFY_DEFAULT_DATASET_ID)
 *     defaultDatasetId: String,
 * &nbsp;
 *     // Amount of memory allocated for the actor,
 *     // in megabytes (APIFY_MEMORY_MBYTES)
 *     memoryMbytes: Number,
 * }
 * ```
 * For the list of the `APIFY_XXX` environment variables, see
 * <a href="http://localhost/docs/actor.php#run-env-vars" target="_blank">Actor documentation</a>.
 * If some of the variables is not defined or is invalid, the corresponding value in the resulting object will be null.
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
    return {
        actId: env[ENV_VARS.ACT_ID] || null,
        actRunId: env[ENV_VARS.ACT_RUN_ID] || null,
        userId: env[ENV_VARS.USER_ID] || null,
        token: env[ENV_VARS.TOKEN] || null,
        startedAt: tryParseDate(env[ENV_VARS.STARTED_AT]) || null,
        timeoutAt: tryParseDate(env[ENV_VARS.TIMEOUT_AT]) || null,
        defaultKeyValueStoreId: env[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID] || null,
        defaultDatasetId: env[ENV_VARS.DEFAULT_DATASET_ID] || null,
        // internalPort: parseInt(env[ENV_VARS.INTERNAL_PORT], 10) || null,
        memoryMbytes: parseInt(env[ENV_VARS.MEMORY_MBYTES], 10) || null,
    };
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
 *   <li>When running on the Apify platform, it sets up a connection to listen for platform events.
 *   For example, to get a notification about an imminent migration to another server.
 *   See <a href="#module-Apify-events"><code>Apify.events</code></a> for details.
 *   </li>
 *   <li>It invokes the user function passed as the `userFunc` parameter.</li>
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
 * If the user function returns a promise, it is considered as asynchronous:
 * ```javascript
 * const request = require('request-promise');
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
 * const request = require('request-promise');
 *
 * Apify.main(async () => {
 *   // My asynchronous function
 *   const html = await request('http://www.example.com');
 *   console.log(html);
 * });
 * ```
 *
 * @param userFunc {Function} User function to be executed. If it returns a promise,
 * the promise will be awaited. The user function is called with no arguments.
 *
 * @memberof module:Apify
 * @function
 * @name main
 */
export const main = (userFunc) => {
    if (!userFunc || typeof (userFunc) !== 'function') {
        throw new Error('Handler function must be provided as a parameter');
    }

    // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
    // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
    let exited = false;
    const exitWithError = (err, exitCode, message) => {
        console.error(message);
        console.error(err.stack || err);
        exited = true;
        // console.log(`Exiting with code: ${exitCode}`);
        process.exit(exitCode);
    };

    // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
    // await new Promise(() => {})
    // Such a construct is used for testing of actor timeouts and aborts.
    const intervalId = setInterval(_.noop, 9999999);

    try {
        newPromise()
            .then(() => initializeEvents())
            .then(() => userFunc())
            .catch((err) => {
                stopEvents();
                clearInterval(intervalId);
                if (!exited) {
                    exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW, 'User function threw an exception:');
                }
            })
            .then(() => {
                stopEvents();
                clearInterval(intervalId);
                if (!exited) {
                    process.exit(EXIT_CODES.SUCCESS);
                }
            });
    } catch (err) {
        // This can happen e.g. if there's no Promise dependency
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN, 'Unknown error occurred');
    }
};


/**
 * Runs an actor on the Apify platform using the current user account (given by the `APIFY_TOKEN` environment variable),
 * waits for the actor to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an object that contains details about the actor run and its output (if any).
 *
 * Example usage:
 *
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * The resulting `run` object looks something like this:
 *
 * ```javascript
 * {
 *   "id": "cJwyzNkBf229ZQRcQ",
 *   "actId": "E2jjCZBezvAZnX8Rb",
 *   "userId": "mb7q2dycFBHDhae6A",
 *   "startedAt": new Date("2018-08-10T14:41:37.527Z"),
 *   "finishedAt": new Date("2018-08-10T14:41:41.859Z"),
 *   "status": "SUCCEEDED",
 *   "meta": {
 *     "origin": "API",
 *     "clientIp": null,
 *     "userAgent": "ApifyClient/0.2.13 (Linux; Node/v8.11.3)"
 *   },
 *   "stats": {
 *     "inputBodyLen": 22,
 *     "restartCount": 0,
 *     ...
 *   },
 *   "options": {
 *     "build": "latest",
 *     "timeoutSecs": 0,
 *     "memoryMbytes": 256,
 *     "diskMbytes": 512
 *   },
 *   "buildId": "AzgKquDoX8EGdWzto",
 *   "exitCode": 0,
 *   "defaultKeyValueStoreId": "aH8tKjD4kATC4Wptc",
 *   "defaultDatasetId": "iug7s8angh3BwNj9Q",
 *   "defaultRequestQueueId": "fQfghRijKLTMchns3",
 *   "buildNumber": "0.0.10",
 *   "containerUrl": "https://c8o2s6key3uy.runs.apify.net",
 *   "output": {
 *     "contentType": "application/json; charset=utf-8",
 *     "body": {
 *       "message": "Hello world!"
 *     }
 *   }
 * }
 * ```
 * Internally, the `Apify.call` function calls the
 * <a href="https://www.apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Run actor</a>
 * API endpoint and few others to obtain the output.
 *
 * @param {String} actId
 *  Either `username/actor-name` or actor ID.
 * @param {Object|String|Buffer} [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type is set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param {Object} [options]
 *   Object with settings
 * @param {String} [options.contentType]
 *  Content type for the `input`. If not specified,
 *  `input` is expected to be an object that will be stringified to JSON and content type set to
 *  `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
 *  `String` or `Buffer`.
 * @param {String} [options.token]
 *  User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {Number} [options.memory]
 *  Memory in megabytes which will be allocated for the new actor run.
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
 * @returns {Promise}
 * @throws {ApifyCallError} If the run did not succeed, e.g. if it failed or timed out.
 *
 * @memberof module:Apify
 * @function
 * @name call
 */
export const call = (actId, input, opts = {}) => {
    const { acts, keyValueStores } = apifyClient;

    checkParamOrThrow(actId, 'actId', 'String');
    checkParamOrThrow(opts, 'opts', 'Object');

    // Common options.
    const { token } = opts;
    checkParamOrThrow(token, 'token', 'Maybe String');
    const defaultOpts = { actId };
    if (token) defaultOpts.token = token;

    // RunAct() options.
    const { build, memory } = opts;
    const runActOpts = {};
    checkParamOrThrow(build, 'build', 'Maybe String');
    checkParamOrThrow(memory, 'memory', 'Maybe Number');
    if (build) runActOpts.build = build;
    if (memory) runActOpts.memory = memory;

    if (input) {
        input = maybeStringify(input, opts);

        checkParamOrThrow(input, 'input', 'Buffer|String');
        checkParamOrThrow(opts.contentType, 'contentType', 'String');

        if (opts.contentType) runActOpts.contentType = addCharsetToContentType(opts.contentType);
        runActOpts.body = input;
    }

    // GetAct() options.
    const { timeoutSecs, fetchOutput = true } = opts;
    let { waitSecs } = opts;
    // TODO: This is bad, timeoutSecs should be used! Fix this and mark as breaking change!!!
    //       The comments should be * @param {Number} [options.timeoutSecs]
    //  *  Time limit for the finish of the actor run, in seconds.
    //  *  If the limit is reached the resulting run will have the `TIMED-OUT` status.
    //  *  If not provided, the run uses timeout specified in the default actor run configuration.
    //       And there's no point to have waitSecs more than
    //       30 secs anyway, since connection will break.
    // Backwards compatibility: waitSecs used to be called timeoutSecs
    if (typeof timeoutSecs === 'number' && typeof waitSecs !== 'number') waitSecs = timeoutSecs;
    checkParamOrThrow(waitSecs, 'waitSecs', 'Maybe Number');
    checkParamOrThrow(fetchOutput, 'fetchOutput', 'Boolean');
    const waitUntil = typeof waitSecs === 'number' ? Date.now() + (waitSecs * 1000) : null;

    // GetRecord() options.
    const { disableBodyParser } = opts;
    checkParamOrThrow(disableBodyParser, 'disableBodyParser', 'Maybe Boolean');

    // Adds run.output field to given run and returns it.
    const addOutputToRun = (run) => {
        const getRecordOpts = { key: 'OUTPUT', storeId: run.defaultKeyValueStoreId };
        if (disableBodyParser) getRecordOpts.disableBodyParser = disableBodyParser;

        return keyValueStores
            .getRecord(getRecordOpts)
            .then(output => Object.assign({}, run, { output }));
    };

    // Keeps requesting given run until it gets finished or timeout is reached.
    const waitForRunToFinish = (run) => {
        const waitForFinish = waitUntil !== null ? Math.round((waitUntil - Date.now()) / 1000) : 999999;

        // We are timing out ...
        if (waitForFinish <= 0) return Promise.resolve(run);

        return acts
            .getRun(Object.assign({}, defaultOpts, { waitForFinish, runId: run.id }))
            .then((updatedRun) => {
                // It might take some time for database replicas to get up-to-date,
                // so getRun() might return null. Wait a little bit and try it again.
                if (!updatedRun) {
                    return Promise.delay(250).then(() => {
                        return waitForRunToFinish(run);
                    });
                }

                if (!_.contains(ACT_TASK_TERMINAL_STATUSES, updatedRun.status)) return waitForRunToFinish(updatedRun);
                if (updatedRun.status !== ACT_TASK_STATUSES.SUCCEEDED) throw new ApifyCallError(updatedRun);
                if (!fetchOutput) return updatedRun;

                return addOutputToRun(updatedRun);
            });
    };

    return acts
        .runAct(Object.assign({}, defaultOpts, runActOpts))
        .then(run => waitForRunToFinish(run));
};

/**
 * Constructs the URL to the Apify Proxy using the specified settings.
 * The proxy URL can be used from Apify actors, web browsers or any other HTTP
 * proxy-enabled applications.
 *
 * For more information, see
 * the <a href="https://my.apify.com/proxy">Apify Proxy</a> page in the app
 * or the <a href="https://www.apify.com/docs/proxy">documentation</a>.
 *
 * @param {Object} opts
 * @param {String} opts.password User's password for the proxy.
 * By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable,
 * which is automatically set by the system when running the actors on the Apify cloud.
 * @param {String[]} [opts.groups] Array of Apify Proxy groups to be used.
 * If not provided, the proxy will select the groups automatically.
 * @param {String} [opts.session] Apify Proxy session identifier to be used by the Chrome browser.
 * All HTTP requests going through the proxy with the same session identifier
 * will use the same target proxy server (i.e. the same IP address).
 * The identifier can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
 *
 * @returns {String} Returns the proxy URL, e.g. `http://auto:my_password@proxy.apify.com:8000`.
 *
 * @memberof module:Apify
 * @function
 * @name getApifyProxyUrl
 */
export const getApifyProxyUrl = (opts = {}) => {
    // For backwards compatibility.
    // TODO: remove this when we release v1.0.0
    if (!opts.groups && opts.apifyProxyGroups) {
        log.warning('Parameter `apifyProxyGroups` of Apify.getApifyProxyUrl() is deprecated!!! Use `groups` instead!');
        opts.groups = opts.apifyProxyGroups;
    }
    if (!opts.session && opts.apifyProxySession) {
        log.warning('Parameter `apifyProxySession` of Apify.getApifyProxyUrl() is deprecated!!! Use `session` instead!');
        opts.session = opts.apifyProxySession;
    }

    const {
        groups,
        session,
        password = process.env[ENV_VARS.PROXY_PASSWORD],
        hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || DEFAULT_PROXY_HOSTNAME,
        port = parseInt(process.env[ENV_VARS.PROXY_PORT], 10) || DEFAULT_PROXY_PORT,

        // This is used only internaly. Some other function calling this function use different naming for groups and session
        // parameters so we need to override this in error messages.
        groupsParamName = 'opts.groups',
        sessionParamName = 'opts.session',
    } = opts;

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

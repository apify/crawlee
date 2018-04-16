import _ from 'underscore';
import Promise from 'bluebird';
import fs from 'fs';
import { checkParamOrThrow } from 'apify-client/build/utils';
import { PROXY_GROUP_NAME_REGEX, PROXY_SESSION_ID_REGEX } from 'apify-shared/regexs';
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
 *     // ID of the act (APIFY_ACT_ID)
 *     actId: String,
 * &nbsp;
 *     // ID of the act run (APIFY_ACT_RUN_ID)
 *     actRunId: String,
 * &nbsp;
 *     // ID of the user who started the act - note that it might be
 *     // different than the owner of the act (APIFY_USER_ID)
 *     userId: String,
 * &nbsp;
 *     // Authentication token representing privileges given to the act run,
 *     // it can be passed to various Apify APIs (APIFY_TOKEN).
 *     token: String,
 * &nbsp;
 *     // Date when the act was started (APIFY_STARTED_AT)
 *     startedAt: Date,
 * &nbsp;
 *     // Date when the act will time out (APIFY_TIMEOUT_AT)
 *     timeoutAt: Date,
 * &nbsp;
 *     // ID of the key-value store where input and output data of this
 *     // act is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
 *     defaultKeyValueStoreId: String,
 * &nbsp;
 *    // ID of the dataset where input and output data of this
 *     // act is stored (APIFY_DEFAULT_DATASET_ID)
 *     defaultDatasetId: String,
 * &nbsp;
 *     // Amount of memory allocated for the act run,
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
    // NOTE: Don't throw if env vars are invalid to simplify local development and debugging of acts
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
 * Runs a user function that performs the logic of the act.
 * The `Apify.main(userFunct)` function does the following actions:
 *
 * <ol>
 *   <li>Invokes the user function passed as the `userFunc` parameter</li>
 *   <li>If the user function returned a promise, waits for it to resolve</li>
 *   <li>If the user function throws an exception or some other error is encountered,
 *       prints error details to console so that they are stored to the log file</li>
 *   <li>Exits the process</li>
 * </ol>
 *
 * In the simplest case, the user function is synchronous:
 *
 * ```javascript
 * Apify.main(() => {
 *     // My synchronous function that returns immediately
 * });
 * ```
 *
 * If the user function returns a promise, it is considered as asynchronous:
 * ```javascript
 * const request = require('request-promise');
 * Apify.main(() => {
 *     // My asynchronous function that returns a promise
 *     return Promise.resolve()
 *     .then(() => {
 *         return request('http://www.example.com');
 *     })
 *     .then((html) => {
 *         console.log(html);
 *     });
 * });
 * ```
 *
 * To simplify your code, you can take advantage of the `async`/`await` keywords:
 *
 * ```javascript
 * const request = require('request-promise');
 * Apify.main(async () => {
 *      const html = await request('http://www.example.com');
 *      console.log(html);
 * });
 * ```
 *
 * Note that the use of `Apify.main()` in acts is optional;
 * the function is provided merely for user convenience and acts don't need to use it.
 *
 * @param userFunc {Function} User function to be executed
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
    // Such a construct is used for testing of act timeouts and aborts.
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

// TODO: this should rather be called Apify.listeningOnPort() or something like that

/**
 * Notifies Apify runtime that act is listening on port specified by the APIFY_INTERNAL_PORT environment
 * variable and is ready to receive a HTTP request with act input.
 *
 * @ignore
 */
export const readyFreddy = () => {
    const watchFileName = process.env[ENV_VARS.WATCH_FILE];
    if (watchFileName) {
        fs.writeFile(watchFileName, '', (err) => {
            if (err) console.log(`WARNING: Cannot write to watch file ${watchFileName}: ${err}`);
        });
    } else {
        console.log(`WARNING: ${ENV_VARS.WATCH_FILE} environment variable not specified, readyFreddy() has no effect.`);
    }
};

/**
 * Runs another act under the current user account, waits for the act to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an object that contains details about the run and potentially its output.
 * For example:
 *
 * ```json
 * {
 *     "id": "ErYkuTTsmKiXccNGT",
 *     "actId": "E2jjCZBezvAZnX8Rb",
 *     "userId": "mb7q2dycFBHDhae6A",
 *     "startedAt": "2017-10-25T14:23:44.376Z",
 *     "finishedAt": "2017-10-25T14:23:46.723Z",
 *     "status": "SUCCEEDED",
 *     "meta": { "origin": "API", "clientIp": "1.2.3.4", "userAgent": null },
 *     "stats": {
 *         "netRxBytes": 180,
 *         "netTxBytes": 0,
 *         ...
 *     },
 *     "options": {
 *        "build": "latest",
 *        "timeoutSecs": 0,
 *        "memoryMbytes": 512,
 *        "diskMbytes": 1024
 *     },
 *     "buildId": "Bwkqk59MCkdexDP34",
 *     "exitCode": 0,
 *     "defaultKeyValueStoreId": "ccFfRptZru2uqdQHP",
 *     "defaultDatasetId": "tZru2uqdQHPcgFtRo",
 *     "buildNumber": "0.1.2",
 *     "output": {
 *         "contentType": "application/json; charset=utf-8",
 *         "body": { "message": "Hello world!" }
 *     }
 * }
 * ```
 * Internally, the function calls the
 * <a href="https://www.apify.com/docs/api/v2#/reference/acts/runs-collection/run-act" target="_blank">Run act</a>
 * API endpoint and few others.
 *
 * Example usage:
 *
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * @param {String} actId Either `username/act-name` or act ID.
 * @param {Object|String|Buffer} [input] Act input body. If it is an object, it is stringified to
 *                                         JSON and the content type set to `application/json; charset=utf-8`.
 * @param {Object} [opts]
 * @param {String} [opts.token] User API token. By default, it is taken from the `APIFY_TOKEN` environment variable.
 * @param {String} [opts.build] Tag or number of act build to be run (e.g. `beta` or `1.2.345`).
 *                                If not provided, the default build tag or number from act configuration is used (typically `latest`).
 * @param {String} [opts.contentType] Content type for the `input`. If not specified,
 *                                      `input` is expected to be an object that will be stringified to JSON and content type set to
 *                                      `application/json; charset=utf-8`. If `opts.contentType` is specified, then `input` must be a
 *                                      `String` or `Buffer`.
 * @param {Number} [opts.timeoutSecs] Time limit for act to finish, in seconds.
 *                                      If the limit is reached the resulting run will have the `RUNNING` status.
 *                                      By default, there is no timeout.
 * @param {String} [opts.waitSecs] - Maximum time to wait for act run to finish, in seconds.
 *                                     If the limit is reached, the returned promise is resolved to a run object that will have
 *                                     status `READY` or `RUNNING` and it will not contain the act run output.
 *                                     If `waitSecs` is null or undefined, the function waits for the act to finish (default behavior).
 * @param {Boolean} [opts.fetchOutput=true] If `false` then the function does not fetch output of the act.
 * @param {Boolean} [opts.disableBodyParser=false] If `true` then the function will not attempt to parse the
 *                                                act's output and will return it in a raw `Buffer`.
 * @returns {Promise}
 * @throws {ApifyCallError} If run doesn't succeed.
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
    const { build } = opts;
    const runActOpts = {};
    checkParamOrThrow(build, 'build', 'Maybe String');
    if (build) runActOpts.build = build;

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
                    return new Promise(resolve => setTimeout(resolve, 250))
                        .then(() => {
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
 * Returns a URL of Apify Proxy that can be used from Actor acts, web browsers or any other HTTP
 * proxy-enabled applications. For more info about Apify Proxy see
 * <a href="https://www.apify.com/docs/proxy" target="_blank">https://www.apify.com/docs/proxy</a>.
 *
 * @param {Object} opts
 * @param {String} opts.password User proxy password. By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable.
 * @param {String} [opts.groups] Proxy groups to be used.
 * @param {String} [opts.session] Session ID that identifies requests that should use the same proxy connection.
 * @returns {String} Returns proxy URL.
 *
 * @memberof module:Apify
 * @function
 * @name getApifyProxyUrl
 */
export const getApifyProxyUrl = (opts = {}) => {
    const {
        groups,
        session,
        password = process.env[ENV_VARS.PROXY_PASSWORD],
        hostname = process.env[ENV_VARS.PROXY_HOSTNAME] || DEFAULT_PROXY_HOSTNAME,
        port = parseInt(process.env[ENV_VARS.PROXY_PORT], 10) || DEFAULT_PROXY_PORT,
    } = opts;

    const getMissingParamErrorMgs = (param, env) => `Apify Proxy ${param} must be provided as parameter or "${env}" environment variable!`;
    const throwNonAlphanumericError = (param) => { throw new Error(`Only alphanumeric characters and underscore are allowed in ${param}`); };

    checkParamOrThrow(groups, 'opts.groups', 'Maybe [String]');
    checkParamOrThrow(session, 'opts.session', 'Maybe Number | String');
    checkParamOrThrow(password, 'opts.password', 'String', getMissingParamErrorMgs('password', ENV_VARS.PROXY_PASSWORD));
    checkParamOrThrow(hostname, 'opts.hostname', 'String', getMissingParamErrorMgs('hostname', ENV_VARS.PROXY_HOSTNAME));
    checkParamOrThrow(port, 'opts.port', 'Number', getMissingParamErrorMgs('port', ENV_VARS.PROXY_PORT));

    let username;

    if (groups || session) {
        const parts = [];

        if (groups && groups.length) {
            if (!groups.every(group => PROXY_GROUP_NAME_REGEX.test(group))) throwNonAlphanumericError('proxy group names');
            parts.push(`GROUPS-${groups.join('+')}`);
        }
        if (session) {
            if (!PROXY_SESSION_ID_REGEX.test(session)) throwNonAlphanumericError('proxy session ID');
            parts.push(`SESSION-${session}`);
        }

        username = parts.join(',');
    } else {
        username = 'auto';
    }

    return `http://${username}:${password}@${hostname}:${port}`;
};

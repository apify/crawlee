import ow from 'ow';
import { ACT_JOB_STATUSES, ENV_VARS } from '@apify/consts';
import { getEnv } from './actor';
import { initializeEvents, stopEvents } from './events';
import { StorageManager } from './storages/storage_manager';
import { Dataset } from './storages/dataset';
import { KeyValueStore, maybeStringify } from './storages/key_value_store';
import { RequestList, REQUESTS_PERSISTENCE_KEY, STATE_PERSISTENCE_KEY } from './request_list';
import { RequestQueue } from './storages/request_queue';
import { SessionPool } from './session_pool/session_pool';
import { ProxyConfiguration } from './proxy_configuration';
import { addCharsetToContentType, logSystemInfo, printOutdatedSdkWarning, publicUtils, sleep } from './utils';
import log from './utils_log';
import { EXIT_CODES } from './constants';
import { Configuration } from './configuration';
import { puppeteerUtils } from './puppeteer_utils';
import { playwrightUtils } from './playwright_utils';
import { socialUtils } from './utils_social';
import { enqueueLinks } from './enqueue_links/enqueue_links';
import { requestAsBrowser } from './utils_request';
import { ApifyCallError } from './errors';

/**
 * `Apify` class serves as an alternative approach to the static helpers exported from the package. It allows to pass configuration
 * that will be used on the instance methods. Environment variables will have precedence over this configuration.
 * See {@link Configuration} for details about what can be configured and what are the default values.
 *
 * @property {Configuration} config Configuration of this SDK instance (provided to its constructor). See {@link Configuration} for details.
 * @ignore
 */
export class Apify {
    constructor(options = {}) {
        this.config = new Configuration(options);
        this._storageManagers = new Map();
    }

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
     * @return {Promise<unknown>}
     */
    main(userFunc) {
        if (!userFunc || typeof (userFunc) !== 'function') {
            // eslint-disable-next-line max-len
            throw new Error(`Apify.main() accepts a single parameter that must be a function (was '${userFunc === null ? 'null' : typeof userFunc}').`);
        }

        // Logging some basic system info (apify and apify-client version, NodeJS version, ...).
        logSystemInfo();

        // Log warning if SDK is outdated.
        printOutdatedSdkWarning();

        // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
        // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
        let exited = false;
        const exitWithError = (err, exitCode) => {
            log.exception(err);
            exited = true;
            process.exit(exitCode);
        };

        // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
        // await new Promise(() => {})
        // Such a construct is used for testing of actor timeouts and aborts.
        const intervalId = setInterval((i) => i, 9999999);

        // Using async here to have nice stack traces for errors
        try {
            initializeEvents(this.config);
            return (async () => {
                try {
                    await userFunc();
                    process.exit(EXIT_CODES.SUCCESS);
                } catch (err) {
                    if (!exited) {
                        exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW);
                    }
                }
            })();
        } catch (err) {
            exitWithError(err, EXIT_CODES.ERROR_UNKNOWN);
        } finally {
            stopEvents();
            clearInterval(intervalId);
        }
    }

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
     */
    async call(actId, input, options = {}) {
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
            token = this.config.get('token'),
            fetchOutput = true,
            disableBodyParser = false,
            memoryMbytes,
            timeoutSecs,
            ...callActorOpts
        } = options;

        callActorOpts.memory = memoryMbytes;
        callActorOpts.timeout = timeoutSecs;
        callActorOpts.token = token;

        if (input) {
            callActorOpts.contentType = addCharsetToContentType(callActorOpts.contentType);
            input = maybeStringify(input, callActorOpts);
        }

        const client = this.newClient({ token });

        let run;
        try {
            run = await client.actor(actId).call(input, callActorOpts);
        } catch (err) {
            if (err.message.startsWith('Waiting for run to finish')) {
                throw new ApifyCallError({ id: run.id, actId: run.actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
            }
            throw err;
        }

        if (this._isRunUnsuccessful(run.status)) {
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
    }

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
     */
    async callTask(taskId, input, options = {}) {
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
            token = this.config.get('token'),
            fetchOutput = true,
            disableBodyParser = false,
            memoryMbytes,
            timeoutSecs,
            ...callTaskOpts
        } = options;

        callTaskOpts.memory = memoryMbytes;
        callTaskOpts.timeout = timeoutSecs;
        callTaskOpts.token = token;

        const client = this.newClient({ token });
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

        if (this._isRunUnsuccessful(run.status)) {
            // eslint-disable-next-line max-len
            const message = `The actor task ${taskId} invoked by Apify.callTask() did not succeed. For details, see https://my.apify.com/view/runs/${run.id}`;
            throw new ApifyCallError(run, message);
        }

        // Finish if output is not requested or run haven't finished.
        if (!fetchOutput || run.status !== ACT_JOB_STATUSES.SUCCEEDED) return run;

        // Fetch output.
        let getRecordOptions = {};
        if (disableBodyParser) getRecordOptions = { buffer: true };

        const { value: body, contentType } = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT', getRecordOptions);

        return { ...run, output: { contentType, body } };
    }

    /**
     * Transforms this actor run to an actor run of a given actor. The system stops the current container and starts
     * the new container instead. All the default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key
     * in the same default key-value store.
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
     */
    async metamorph(targetActorId, input, options = {}) {
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

        const actorId = this.config.get('actorId');
        const runId = this.config.get('actorRunId');
        if (!actorId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_ID} must be provided!`);
        if (!runId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} must be provided!`);

        if (input) {
            metamorphOpts.contentType = addCharsetToContentType(metamorphOpts.contentType);
            input = maybeStringify(input, metamorphOpts);
        }

        await this.newClient().run(runId).metamorph(targetActorId, input, metamorphOpts);

        // Wait some time for container to be stopped.
        // NOTE: option.customAfterSleepMillis is used in tests
        await sleep(customAfterSleepMillis || this.config.get('metamorphAfterSleepMillis'));
    }

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
     */
    async addWebhook(options) {
        ow(options, ow.object.exactShape({
            eventTypes: ow.array.ofType(ow.string),
            requestUrl: ow.string,
            payloadTemplate: ow.optional.string,
            idempotencyKey: ow.optional.string,
        }));

        const { eventTypes, requestUrl, payloadTemplate, idempotencyKey } = options;

        if (!this.isAtHome()) {
            log.warning('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
            return;
        }

        const runId = this.config.get('actorRunId');
        if (!runId) {
            throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} is not set!`);
        }

        return this.newClient().webhooks().create({
            isAdHoc: true,
            eventTypes,
            condition: {
                actorRunId: runId,
            },
            requestUrl,
            payloadTemplate,
            idempotencyKey,
        });
    }

    /**
     * Stores an object or an array of objects to the default {@link Dataset} of the current actor run.
     *
     * This is just a convenient shortcut for {@link Dataset#pushData}.
     * For example, calling the following code:
     * ```javascript
     * await Apify.pushData({ myValue: 123 });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const dataset = await Apify.openDataset();
     * await dataset.pushData({ myValue: 123 });
     * ```
     *
     * For more information, see {@link Apify#openDataset} and {@link Dataset#pushData}
     *
     * **IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
     * otherwise the actor process might finish before the data are stored!
     *
     * @param {object} item Object or array of objects containing data to be stored in the default dataset.
     * The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.
     * @returns {Promise<void>}
     */
    async pushData(item) {
        const dataset = await this.openDataset();
        return dataset.pushData(item);
    }

    /**
     * Opens a dataset and returns a promise resolving to an instance of the {@link Dataset} class.
     *
     * Datasets are used to store structured data where each object stored has the same attributes,
     * such as online store products or real estate offers.
     * The actual data is stored either on the local filesystem or in the cloud.
     *
     * For more details and code examples, see the {@link Dataset} class.
     *
     * @param {string} [datasetIdOrName]
     *   ID or name of the dataset to be opened. If `null` or `undefined`,
     *   the function returns the default dataset associated with the actor run.
     * @param {Object} [options]
     * @param {boolean} [options.forceCloud=false]
     *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
     *   environment variable is set. This way it is possible to combine local and cloud storage.
     * @returns {Promise<Dataset>}
     */
    async openDataset(datasetIdOrName, options = {}) {
        ow(datasetIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager(Dataset).openStorage(datasetIdOrName, options);
    }

    /**
     * Gets a value from the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for {@link KeyValueStore#getValue}.
     * For example, calling the following code:
     * ```javascript
     * const value = await Apify.getValue('my-key');
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * const value = await store.getValue('my-key');
     * ```
     *
     * To store the value to the default key-value store, you can use the {@link Apify#setValue} function.
     *
     * For more information, see  {@link Apify#openKeyValueStore}
     * and  {@link KeyValueStore#getValue}.
     *
     * @param {string} key
     *   Unique record key.
     * @returns {Promise<Object<string, *>|string|Buffer|null>}
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     */
    async getValue(key) {
        const store = await this.openKeyValueStore();
        return store.getValue(key);
    }

    /**
     * Stores or deletes a value in the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for  {@link KeyValueStore#setValue}.
     * For example, calling the following code:
     * ```javascript
     * await Apify.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * await store.setValue('OUTPUT', { foo: "bar" });
     * ```
     *
     * To get a value from the default key-value store, you can use the  {@link Apify#getValue} function.
     *
     * For more information, see  {@link Apify#openKeyValueStore}
     * and  {@link KeyValueStore#getValue}.
     *
     * @param {string} key
     *   Unique record key.
     * @param {*} value
     *   Record data, which can be one of the following values:
     *    - If `null`, the record in the key-value store is deleted.
     *    - If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
     *    - If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html).
     *   For any other value an error will be thrown.
     * @param {object} [options]
     * @param {string} [options.contentType]
     *   Specifies a custom MIME content type of the record.
     * @return {Promise<void>}
     */
    async setValue(key, value, options) {
        const store = await this.openKeyValueStore();
        return store.setValue(key, value, options);
    }

    /**
     * Gets the actor input value from the default {@link KeyValueStore} associated with the current actor run.
     *
     * This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](key-value-store#getvalue).
     * For example, calling the following code:
     * ```javascript
     * const input = await Apify.getInput();
     * ```
     *
     * is equivalent to:
     * ```javascript
     * const store = await Apify.openKeyValueStore();
     * await store.getValue('INPUT');
     * ```
     *
     * Note that the `getInput()` function does not cache the value read from the key-value store.
     * If you need to use the input multiple times in your actor,
     * it is far more efficient to read it once and store it locally.
     *
     * For more information, see  {@link Apify#openKeyValueStore}
     * and {@link KeyValueStore#getValue}.
     *
     * @returns {Promise<Object<string, *>|string|Buffer|null>}
     *   Returns a promise that resolves to an object, string
     *   or [`Buffer`](https://nodejs.org/api/buffer.html), depending
     *   on the MIME content type of the record, or `null`
     *   if the record is missing.
     */
    async getInput() {
        return this.getValue(this.config.get('inputKey'));
    }

    /**
     * Opens a key-value store and returns a promise resolving to an instance of the {@link KeyValueStore} class.
     *
     * Key-value stores are used to store records or files, along with their MIME content type.
     * The records are stored and retrieved using a unique key.
     * The actual data is stored either on a local filesystem or in the Apify cloud.
     *
     * For more details and code examples, see the {@link KeyValueStore} class.
     *
     * @param {string} [storeIdOrName]
     *   ID or name of the key-value store to be opened. If `null` or `undefined`,
     *   the function returns the default key-value store associated with the actor run.
     * @param {object} [options]
     * @param {boolean} [options.forceCloud=false]
     *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
     *   environment variable is set. This way it is possible to combine local and cloud storage.
     * @returns {Promise<KeyValueStore>}
     */
    async openKeyValueStore(storeIdOrName, options = {}) {
        ow(storeIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager(KeyValueStore).openStorage(storeIdOrName, options);
    }

    /**
     * Opens a request list and returns a promise resolving to an instance
     * of the {@link RequestList} class that is already initialized.
     *
     * {@link RequestList} represents a list of URLs to crawl, which is always stored in memory.
     * To enable picking up where left off after a process restart, the request list sources
     * are persisted to the key-value store at initialization of the list. Then, while crawling,
     * a small state object is regularly persisted to keep track of the crawling status.
     *
     * For more details and code examples, see the {@link RequestList} class.
     *
     * **Example usage:**
     *
     * ```javascript
     * const sources = [
     *     'https://www.example.com',
     *     'https://www.google.com',
     *     'https://www.bing.com'
     * ];
     *
     * const requestList = await Apify.openRequestList('my-name', sources);
     * ```
     *
     * @param {string|null} listName
     *   Name of the request list to be opened. Setting a name enables the `RequestList`'s state to be persisted
     *   in the key-value store. This is useful in case of a restart or migration. Since `RequestList` is only
     *   stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
     *   state to survive those situations and continue where it left off.
     *
     *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
     *   and `NAME-REQUEST_LIST_SOURCES`.
     *
     *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
     *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
     * @param {Array<RequestOptions|Request|string>} sources
     *  An array of sources of URLs for the {@link RequestList}. It can be either an array of strings,
     *  plain objects that define at least the `url` property, or an array of {@link Request} instances.
     *
     *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@link RequestList} initializes.
     *  This is a measure to prevent memory leaks in situations when millions of sources are
     *  added.
     *
     *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
     *  which will instruct {@link RequestList} to download the source URLs from a given remote location.
     *  The URLs will be parsed from the received response. In this case you can limit the URLs
     *  using `regex` parameter containing regular expression pattern for URLs to be included.
     *
     *  For details, see the {@link RequestListOptions.sources}
     * @param {RequestListOptions} [options]
     *   The {@link RequestList} options. Note that the `listName` parameter supersedes
     *   the {@link RequestListOptions.persistStateKey} and {@link RequestListOptions.persistRequestsKey}
     *   options and the `sources` parameter supersedes the {@link RequestListOptions.sources} option.
     * @returns {Promise<RequestList>}
     */
    async openRequestList(listName, sources, options = {}) {
        ow(listName, ow.any(ow.string, ow.null));
        ow(sources, ow.array);
        ow(options, ow.object.is((v) => !Array.isArray(v)));

        const rl = new RequestList({
            ...options,
            persistStateKey: listName ? `${listName}-${STATE_PERSISTENCE_KEY}` : undefined,
            persistRequestsKey: listName ? `${listName}-${REQUESTS_PERSISTENCE_KEY}` : undefined,
            sources,
        });
        await rl.initialize();

        return rl;
    }

    /**
     * Opens a request queue and returns a promise resolving to an instance
     * of the {@link RequestQueue} class.
     *
     * {@link RequestQueue} represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
     * The queue is used for deep crawling of websites, where you start with several URLs and then
     * recursively follow links to other pages. The data structure supports both breadth-first
     * and depth-first crawling orders.
     *
     * For more details and code examples, see the {@link RequestQueue} class.
     *
     * @param {string} [queueIdOrName]
     *   ID or name of the request queue to be opened. If `null` or `undefined`,
     *   the function returns the default request queue associated with the actor run.
     * @param {object} [options]
     * @param {boolean} [options.forceCloud=false]
     *   If set to `true` then the function uses cloud storage usage even if the `APIFY_LOCAL_STORAGE_DIR`
     *   environment variable is set. This way it is possible to combine local and cloud storage.
     * @returns {Promise<RequestQueue>}
     */
    async openRequestQueue(queueIdOrName, options = {}) {
        ow(queueIdOrName, ow.optional.string);
        ow(options, ow.object.exactShape({
            forceCloud: ow.optional.boolean,
        }));

        return this._getStorageManager(RequestQueue).openStorage(queueIdOrName, options);
    }

    /**
     * Opens a SessionPool and returns a promise resolving to an instance
     * of the {@link SessionPool} class that is already initialized.
     *
     * For more details and code examples, see the {@link SessionPool} class.
     *
     * @param {SessionPoolOptions} sessionPoolOptions
     * @return {Promise<SessionPool>}
     */
    async openSessionPool(sessionPoolOptions) {
        const sessionPool = new SessionPool(sessionPoolOptions, this.config);
        await sessionPool.initialize();

        return sessionPool;
    }

    /**
     * Creates a proxy configuration and returns a promise resolving to an instance
     * of the {@link ProxyConfiguration} class that is already initialized.
     *
     * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
     * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
     * them to use the selected proxies for all connections.
     *
     * For more details and code examples, see the {@link ProxyConfiguration} class.
     *
     * ```javascript
     *
     * // Returns initialized proxy configuration class
     * const proxyConfiguration = await Apify.createProxyConfiguration({
     *     groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
     *     countryCode: 'US'
     * });
     *
     * const crawler = new Apify.CheerioCrawler({
     *   // ...
     *   proxyConfiguration,
     *   handlePageFunction: ({ proxyInfo }) => {
     *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
     *   }
     * })
     *
     * ```
     *
     * For compatibility with existing Actor Input UI (Input Schema), this function
     * returns `undefined` when the following object is passed as `proxyConfigurationOptions`.
     *
     * ```
     * { useApifyProxy: false }
     * ```
     *
     * @param {ProxyConfigurationOptions} [proxyConfigurationOptions]
     * @returns {Promise<ProxyConfiguration|undefined>}
     */
    async createProxyConfiguration(proxyConfigurationOptions = {}) {
        // Compatibility fix for Input UI where proxy: None returns { useApifyProxy: false }
        // Without this, it would cause proxy to use the zero config / auto mode.
        const dontUseApifyProxy = proxyConfigurationOptions.useApifyProxy === false;
        const dontUseCustomProxies = !proxyConfigurationOptions.proxyUrls;

        if (dontUseApifyProxy && dontUseCustomProxies) {
            return;
        }

        const proxyConfiguration = new ProxyConfiguration(proxyConfigurationOptions, this.config);
        await proxyConfiguration.initialize();

        return proxyConfiguration;
    }

    /**
     * Returns a new {@link ApifyEnv} object which contains information parsed from all the `APIFY_XXX` environment variables.
     *
     * For the list of the `APIFY_XXX` environment variables, see
     * [Actor documentation](https://docs.apify.com/actor/run#environment-variables).
     * If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.
     * @returns {ApifyEnv}
     */
    getEnv() {
        return getEnv();
    }

    /**
     * Returns a new instance of the Apify API client. The `ApifyClient` class is provided
     * by the <a href="https://www.npmjs.com/package/apify-client" target="_blank">apify-client</a>
     * NPM package, and it is automatically configured using the `APIFY_API_BASE_URL`, and `APIFY_TOKEN`
     * environment variables. You can override the token via the available options. That's useful
     * if you want to use the client as a different Apify user than the SDK internals are using.
     *
     * @param {object} [options]
     * @param {string} [options.token]
     * @param {string} [options.maxRetries]
     * @param {string} [options.minDelayBetweenRetriesMillis]
     * @return {ApifyClient}
     */
    newClient(options = {}) {
        return this.config.createClient(options);
    }

    /**
     * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
     *
     * @returns {boolean}
     */
    isAtHome() {
        return !!this.config.get('isAtHome');
    }

    get utils() {
        return {
            ...publicUtils,
            puppeteer: puppeteerUtils,
            playwright: playwrightUtils,
            social: socialUtils,
            log,
            enqueueLinks,
            requestAsBrowser,
        };
    }

    /**
     * @param {Function} storageClass
     * @return {StorageManager}
     * @private
     */
    _getStorageManager(storageClass) {
        if (!this._storageManagers.has(storageClass)) {
            const manager = new StorageManager(storageClass, this.config);
            this._storageManagers.set(storageClass, manager);
        }

        return this._storageManagers.get(storageClass);
    }

    /**
     * @param {ACT_JOB_STATUSES} status
     * @return {boolean}
     * @private
     */
    _isRunUnsuccessful(status) {
        return status !== ACT_JOB_STATUSES.SUCCEEDED
            && status !== ACT_JOB_STATUSES.RUNNING
            && status !== ACT_JOB_STATUSES.READY;
    }
}

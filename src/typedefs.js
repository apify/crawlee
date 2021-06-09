/**
 * Represents information about an actor run, as returned by the
 * {@link Apify#call} or {@link Apify#callTask} function.
 * The object is almost equivalent to the JSON response
 * of the
 * [Actor run](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor)
 * Apify API endpoint and extended with certain fields.
 * For more details, see
 * [Runs.](https://docs.apify.com/actor/run)
 *
 * @typedef ActorRun
 * @property {string} id
 *   Actor run ID
 * @property {string} actId
 *   Actor ID
 * @property {Date} startedAt
 *   Time when the actor run started
 * @property {Date} finishedAt
 *   Time when the actor run finished. Contains `null` for running actors.
 * @property {string} status
 *   Status of the run. For possible values, see
 *   [Run lifecycle](https://docs.apify.com/actor/run#lifecycle)
 *   in Apify actor documentation.
 * @property {Object<string, string>} meta
 *   Actor run meta-data. For example:
 *   ```
 *   {
 *     "origin": "API",
 *     "clientIp": "1.2.3.4",
 *     "userAgent": "ApifyClient/0.2.13 (Linux; Node/v8.11.3)"
 *   }
 *   ```
 * @property {Object<string, number>} stats
 *   An object containing various actor run statistics. For example:
 *   ```
 *   {
 *     "inputBodyLen": 22,
 *     "restartCount": 0,
 *     "workersUsed": 1,
 *   }
 *   ```
 *   Beware that object fields might change in future releases.
 * @property {Object<string, *>} options
 *   Actor run options. For example:
 *   ```
 *   {
 *     "build": "latest",
 *     "waitSecs": 0,
 *     "memoryMbytes": 256,
 *     "diskMbytes": 512
 *   }
 *   ```
 * @property {string} buildId
 *   ID of the actor build used for the run. For details, see
 *   [Builds](https://docs.apify.com/actor/build)
 *   in Apify actor documentation.
 * @property {string} buildNumber
 *   Number of the actor build used for the run. For example, `0.0.10`.
 * @property {number} exitCode
 *   Exit code of the actor run process. It's `null` if actor is still running.
 * @property {string} defaultKeyValueStoreId
 *   ID of the default key-value store associated with the actor run. See {@link KeyValueStore} for details.
 * @property {string} defaultDatasetId
 *   ID of the default dataset associated with the actor run. See {@link Dataset} for details.
 * @property {string} defaultRequestQueueId
 *   ID of the default request queue associated with the actor run. See {@link RequestQueue} for details.
 * @property {string} containerUrl
 *   URL on which the web server running inside actor run's Docker container can be accessed.
 *   For more details, see
 *   [Container web server](https://docs.apify.com/actor/run#container-web-server)
 *   in Apify actor documentation.
 * @property {(Object<string, *>|null|undefined)} output
 *   Contains output of the actor run. The value is `null` or `undefined` in case the actor is still running,
 *   or if you pass `false` to the `fetchOutput` option of {@link Apify#call}.
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

export {};

/**
 * `CherioStatic`, the return type of `cheerio.load()`, is not exported from `@types/cheerio`, so it can not be imported and aliased, it is a global
 * type. We reference the type and redefine it with a bettter name here.
 * @typedef {CheerioStatic} Cheerio
 * @ignore
 */

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
 *   [Run lifecycle](https://docs.apify.com/actor/run#lifecycle)
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
 *   [Builds](https://docs.apify.com/actor/build)
 *   in Apify actor documentation.
 * @property {String} buildNumber
 *   Number of the actor build used for the run. For example, `0.0.10`.
 * @property {Number} exitCode
 *   Exit code of the actor run process. It's `null` if actor is still running.
 * @property {String} defaultKeyValueStoreId
 *   ID of the default key-value store associated with the actor run. See {@link KeyValueStore} for details.
 * @property {String} defaultDatasetId
 *   ID of the default dataset associated with the actor run. See {@link Dataset} for details.
 * @property {String} defaultRequestQueueId
 *   ID of the default request queue associated with the actor run. See {@link RequestQueue} for details.
 * @property {String} containerUrl
 *   URL on which the web server running inside actor run's Docker container can be accessed.
 *   For more details, see
 *   [Container web server](https://docs.apify.com/actor/run#container-web-server)
 *   in Apify actor documentation.
 * @property {Object} output
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

---
id: exports
title: exports
---
<a name="module.exports"></a>

## module.exports
Manages a pool of asynchronous resource-intensive tasks that are executed in parallel.
The pool only starts new tasks if there is enough free CPU and memory available
and the Javascript event loop is not blocked.

The information about the CPU and memory usage is obtained by the `Snapshotter` class,
which makes regular snapshots of system resources that may be either local
or from the Apify cloud infrastructure in case the process is running on the Apify platform.
Meaningful data gathered from these snapshots is provided to `AutoscaledPool` by the `SystemStatus` class.

Before running the pool, you need to implement the following three functions:
[`runTaskFunction()`](AutoscaledPool#runTaskFunction),
[`isTaskReadyFunction()`](AutoscaledPool#isTaskReadyFunction) and
[`isFinishedFunction()`](AutoscaledPool#isFinishedFunction).

The auto-scaled pool is started by calling the [`run()`](AutoscaledPool#run) function.
The pool periodically queries the `isTaskReadyFunction()` function
for more tasks, managing optimal concurrency, until the function resolves to `false`. The pool then queries
the `isFinishedFunction()`. If it resolves to `true`, the run finishes. If it resolves to `false`, it assumes
there will be more tasks available later and keeps querying for tasks, until finally both the
`isTaskReadyFunction()` and `isFinishedFunction()` functions resolve to `true`. If any of the tasks throws
then the `run()` function rejects the promise with an error.

The pool evaluates whether it should start a new task every time one of the tasks finishes
and also in the interval set by the `options.maybeRunIntervalSecs` parameter.

**Example usage:**

```javascript
const pool = new Apify.AutoscaledPool({
    maxConcurrency: 50,
    runTaskFunction: async () => {
        // Run some resource-intensive asynchronous operation here.
    },
    isTaskReadyFunction: async () => {
        // Tell the pool whether more tasks are ready to be processed. (true / false)
    },
    isFinishedFunction: async () => {
        // Tell the pool whether it should finish or wait for more tasks to become available. (true / false)
    }
});

await pool.run();
```

**Kind**: static class of <code>module</code>  

* [.exports](#module.exports)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(purl, requestTemplate)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports()](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)
    * [new module.exports(opts)](#new_module.exports_new)
    * [new module.exports(options)](#new_module.exports_new)

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.runTaskFunction | <code>function</code> |  | A function that performs an asynchronous resource-intensive task.   The function must either be labeled `async` or return a promise. |
| options.isTaskReadyFunction | <code>function</code> |  | A function that indicates whether `runTaskFunction` should be called.   This function is called every time there is free capacity for a new task and it should   indicate whether it should start or not by resolving to either `true` or `false.   Besides its obvious use, it is also useful for task throttling to save resources. |
| options.isFinishedFunction | <code>function</code> |  | A function that is called only when there are no tasks to be processed.   If it resolves to `true` then the pool's run finishes. Being called only   when there are no tasks being processed means that as long as `isTaskReadyFunction()`   keeps resolving to `true`, `isFinishedFunction()` will never be called.   To abort a run, use the `pool.abort()` method. |
| [options.minConcurrency] | <code>Number</code> | <code>1</code> | Minimum number of tasks running in parallel. |
| [options.maxConcurrency] | <code>Number</code> | <code>1000</code> | Maximum number of tasks running in parallel. |
| [options.desiredConcurrencyRatio] | <code>Number</code> | <code>0.95</code> | Minimum level of desired concurrency to reach before more scaling up is allowed. |
| [options.scaleUpStepRatio] | <code>Number</code> | <code>0.05</code> | Defines the fractional amount of desired concurrency to be added with each scaling up.   The minimum scaling step is one. |
| [options.scaleDownStepRatio] | <code>Number</code> | <code>0.05</code> | Defines the amount of desired concurrency to be subtracted with each scaling down.   The minimum scaling step is one. |
| [options.maybeRunIntervalSecs] | <code>Number</code> | <code>0.5</code> | Indicates how often the pool should call the `runTaskFunction()` to start a new task, in seconds.   This has no effect on starting new tasks immediately after a task completes. |
| [options.loggingIntervalSecs] | <code>Number</code> | <code>60</code> | Specifies a period in which the instance logs its state, in seconds.   Set to `null` to disable periodic logging. |
| [options.autoscaleIntervalSecs] | <code>Number</code> | <code>10</code> | Defines in seconds how often the pool should attempt to adjust the desired concurrency   based on the latest system status. Setting it lower than 1 might have a severe impact on performance.   We suggest using a value from 5 to 20. |
| [options.snapshotterOptions] | <code>Number</code> |  | Options to be passed down to the `Snapshotter` constructor. This is useful for fine-tuning   the snapshot intervals and history.   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/snapshotter.js">Snapshotter</a> source code for more details. |
| [options.systemStatusOptions] | <code>Number</code> |  | Options to be passed down to the `SystemStatus` constructor. This is useful for fine-tuning   the system status reports. If a custom snapshotter is set in the options, it will be used   by the pool.   See <a href="https://github.com/apifytech/apify-js/blob/develop/src/autoscaling/system_status.js">SystemStatus</a> source code for more details. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| [options.eventLoopSnapshotIntervalSecs] | <code>Number</code> | <code>0.5</code> | Defines the interval of measuring the event loop response time. |
| [options.maxBlockedMillis] | <code>Number</code> | <code>50</code> | Maximum allowed delay of the event loop in milliseconds.   Exceeding this limit overloads the event loop. |
| [options.memorySnapshotIntervalSecs] | <code>Number</code> | <code>1</code> | Defines the interval of measuring memory consumption.   The measurement itself is resource intensive (25 - 50ms async),   therefore, setting this interval below 1 second is not recommended. |
| [options.maxUsedMemoryRatio] | <code>Number</code> | <code>0.7</code> | Defines the maximum ratio of memory that can be used.   Exceeding this limit overloads the memory. |
| [options.snapshotHistorySecs] | <code>Number</code> | <code>60</code> | Sets the interval in seconds for which a history of resource snapshots   will be kept. Increasing this to very high numbers will affect performance. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| [options.currentHistorySecs] | <code>Number</code> | <code>5</code> | Defines max age of snapshots used in the `isOk()` measurement. |
| [options.maxMemoryOverloadedRatio] | <code>Number</code> | <code>0.2</code> | Sets the maximum ratio of overloaded snapshots in a memory sample.   If the sample exceeds this ratio, the system will be overloaded. |
| [options.maxEventLoopOverloadedRatio] | <code>Number</code> | <code>0.02</code> | Sets the maximum ratio of overloaded snapshots in an event loop sample.   If the sample exceeds this ratio, the system will be overloaded. |
| [options.maxCpuOverloadedRatio] | <code>Number</code> | <code>0.1</code> | Sets the maximum ratio of overloaded snapshots in a CPU sample.   If the sample exceeds this ratio, the system will be overloaded. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handleRequestFunction | <code>function</code> |  | User-provided function that performs the logic of the crawler. It is called for each URL to crawl.   The function that receives an object as argument, with the following field:   <ul>     <li>`request`: the [`Request`](Request) object representing the URL to crawl</li>   </ul>   The function must return a promise. |
| options.requestList | <code>RequestList</code> |  | Static list of URLs to be processed.   Either `RequestList` or `RequestQueue` must be provided. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.   Either RequestList or RequestQueue must be provided. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function that handles requests that failed more then `option.maxRequestRetries` times.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/basic_crawler.js#L11">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | How many times the request is retried if `handleRequestFunction` failed. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `BasicCrawler` and cannot be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handlePageFunction | <code>function</code> |  | User-provided function that performs the logic of the crawler. It is called for each page   loaded and parsed by the crawler.   The function that receives an object as argument, with the following three fields:   <ul>     <li>`$`: the Cheerio object</li>     <li>`html`: the raw HTML</li>     <li>`request`: the [`Request`](Request) object representing the URL to crawl</li>   </ul>   If the function returns a promise, it is awaited. |
| options.requestList | <code>RequestList</code> |  | Static list of URLs to be processed.   Either RequestList or RequestQueue must be provided. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Dynamic queue of URLs to be processed. This is useful for recursive crawling of websites.   Either RequestList or RequestQueue must be provided. |
| [options.requestFunction] | <code>function</code> |  | Overrides the function that performs the HTTP request to get the raw HTML needed for Cheerio.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L264">GitHub</a> for default behavior. |
| [options.handlePageTimeoutSecs] | <code>Number</code> | <code>300</code> | Timeout in which the function passed as `options.handlePageFunction` needs to finish, given in seconds. |
| [options.requestTimeoutSecs] | <code>Number</code> | <code>30</code> | Timeout in which the function passed as `options.requestFunction` needs to finish, given in seconds. |
| [options.ignoreSslErrors] | <code>Boolean</code> | <code>false</code> | If set to true, SSL certificate errors will be ignored. This is dependent on using the default   request function. If using a custom request function, user needs to implement this functionality. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function that handles requests that failed more then `option.maxRequestRetries` times.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/cheerio_crawler.js#L13">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | How many times the request is retried if either `requestFunction` or `handlePageFunction` failed. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `CheerioCrawler` and cannot be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="new_module.exports_new"></a>

### new module.exports(purl, requestTemplate)

| Param | Type | Description |
| --- | --- | --- |
| purl | <code>String</code> | Pseudo URL. |
| requestTemplate | <code>Object</code> | Options for the new {@linkcode Request} instances created for matching URLs. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.handlePageFunction | <code>function</code> |  | Function that is called to process each request.   It is passed an object with the following fields:   `request` is an instance of the `Request` object with details about the URL to open, HTTP method etc.   `page` is an instance of the `Puppeteer.Page` class with `page.goto(request.url)` already called. |
| options.requestList | <code>RequestList</code> |  | List of the requests to be processed.   Either RequestList or RequestQueue must be provided.   See the `requestList` parameter of `BasicCrawler` for more details. |
| options.requestQueue | [<code>RequestQueue</code>](#RequestQueue) |  | Queue of the requests to be processed.   Either RequestList or RequestQueue must be provided.   See the `requestQueue` parameter of `BasicCrawler` for more details. |
| [options.handlePageTimeoutSecs] | <code>Number</code> | <code>300</code> | Timeout in which the function passed as `options.handlePageFunction` needs to finish, in seconds. |
| [options.gotoFunction] | <code>function</code> |  | Overrides the function that opens the request in Puppeteer. The function should return a result of Puppeteer's   <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#pagegotourl-options">page.goto()</a> function,   i.e. a promise resolving to the <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#class-response">Response</a> object.   For example, this is useful if you need to extend the page load timeout or select different criteria   to determine that the navigation succeeded.   Note that a single page object is only used to process a single request and it is closed afterwards.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior. |
| [options.handleFailedRequestFunction] | <code>function</code> |  | Function to handle requests that failed more than `option.maxRequestRetries` times. See the `handleFailedRequestFunction`   parameter of `Apify.BasicCrawler` for details.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L13">GitHub</a> for default behavior. |
| [options.maxRequestRetries] | <code>Number</code> | <code>3</code> | Indicates how many times each request is retried if `handleRequestFunction` failed.   See `maxRequestRetries` parameter of `BasicCrawler`. |
| [options.maxRequestsPerCrawl] | <code>Number</code> |  | Maximum number of pages that the crawler will open. The crawl will stop when this limit is reached.   Always set this value in order to prevent infinite loops in misconfigured crawlers.   Note that in cases of parallel crawling, the actual number of pages visited might be slightly higher than this value.   See `maxRequestsPerCrawl` parameter of `BasicCrawler`. |
| [options.maxOpenPagesPerInstance] | <code>Number</code> | <code>50</code> | Maximum number of opened tabs per browser. If this limit is reached then a new   browser instance is started. See `maxOpenPagesPerInstance` parameter of `PuppeteerPool`. |
| [options.retireInstanceAfterRequestCount] | <code>Number</code> | <code>100</code> | Maximum number of requests that can be processed by a single browser instance.   After the limit is reached the browser will be retired and new requests will   be handled by a new browser instance.   See `retireInstanceAfterRequestCount` parameter of `PuppeteerPool`. |
| [options.instanceKillerIntervalMillis] | <code>Number</code> | <code>60000</code> | How often the launched Puppeteer instances are checked whether they can be   closed. See `instanceKillerIntervalMillis` parameter of `PuppeteerPool`. |
| [options.killInstanceAfterMillis] | <code>Number</code> | <code>300000</code> | If Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then   it is considered retired and no more tabs will be opened. After the last tab is closed   the whole browser is closed too. This parameter defines a time limit for inactivity   after which the browser is closed even if there are pending tabs. See   `killInstanceAfterMillis` parameter of `PuppeteerPool`. |
| [options.launchPuppeteerFunction] | <code>function</code> |  | Overrides the default function to launch a new Puppeteer instance.   See `launchPuppeteerFunction` parameter of `PuppeteerPool`.   See source code on <a href="https://github.com/apifytech/apify-js/blob/master/src/puppeteer_crawler.js#L9">GitHub</a> for default behavior. |
| [options.launchPuppeteerOptions] | [<code>LaunchPuppeteerOptions</code>](#LaunchPuppeteerOptions) |  | Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances.   See `launchPuppeteerOptions` parameter of `PuppeteerPool`. |
| [options.autoscaledPoolOptions] | <code>Object</code> |  | Custom options passed to the underlying [`AutoscaledPool`](AutoscaledPool) instance constructor.   Note that the `runTaskFunction`, `isTaskReadyFunction` and `isFinishedFunction` options   are provided by `PuppeteerCrawler` and should not be overridden. |
| [options.minConcurrency] | <code>Object</code> | <code>1</code> | Sets the minimum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |
| [options.maxConcurrency] | <code>Object</code> | <code>1000</code> | Sets the maximum concurrency (parallelism) for the crawl. Shortcut to the corresponding `AutoscaledPool` option. |

<a name="new_module.exports_new"></a>

### new module.exports()

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [options.maxOpenPagesPerInstance] | <code>Number</code> | <code>50</code> | Maximum number of open pages (i.e. tabs) per browser. When this limit is reached, new pages are loaded in a new browser instance. |
| [options.retireInstanceAfterRequestCount] | <code>Number</code> | <code>100</code> | Maximum number of requests that can be processed by a single browser instance.   After the limit is reached, the browser is retired and new requests are   be handled by a new browser instance. |
| [options.instanceKillerIntervalMillis] | <code>Number</code> | <code>60000</code> | Indicates how often opened Puppeteer instances are checked whether they can be closed. |
| [options.killInstanceAfterMillis] | <code>Number</code> | <code>300000</code> | When Puppeteer instance reaches the `options.retireInstanceAfterRequestCount` limit then   it is considered retired and no more tabs will be opened. After the last tab is closed the   whole browser is closed too. This parameter defines a time limit between the last tab was opened and   before the browser is closed even if there are pending open tabs. |
| [options.launchPuppeteerFunction] | <code>function</code> | <code>launchPuppeteerOptions&amp;nbsp;&#x3D;&gt;&amp;nbsp;Apify.launchPuppeteer(launchPuppeteerOptions)</code> | Overrides the default function to launch a new `Puppeteer` instance. |
| [options.launchPuppeteerOptions] | [<code>LaunchPuppeteerOptions</code>](#LaunchPuppeteerOptions) |  | Options used by `Apify.launchPuppeteer()` to start new Puppeteer instances. |
| [options.recycleDiskCache] | <code>Boolean</code> |  | Enables recycling of disk cache directories by Chrome instances.   When a browser instance is closed, its disk cache directory is not deleted but it's used by a newly opened browser instance.   This is useful to reduce amount of data that needs to be downloaded to speed up crawling and reduce proxy usage.   Note that the new browser starts with empty cookies, local storage etc. so this setting doesn't affect anonymity of your crawler.   Beware that the disk cache directories can consume a lot of disk space.   To limit the space consumed, you can pass the `--disk-cache-size=X` argument to `options.launchPuppeteerOptions.args`,   where `X` is the approximate maximum number of bytes for disk cache.   *IMPORTANT:* Currently this feature only works in headful mode, because of a bug in Chromium.   The `options.recycleDiskCache` setting should not be used together with `--disk-cache-dir` argument in `options.launchPuppeteerOptions.args`. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| options | <code>Object</code> |  |  |
| options.sources | <code>Array</code> |  | An array of sources for the `RequestList`. Its contents can either be just plain objects,  defining at least the 'url' property or instances of the [`Request`](Request) class.  Additionally a `requestsFromUrl` property may be used instead of `url`,  which will instruct the `RequestList` to download the sources from the given remote location.  The URLs will be parsed from the received response. ```javascript [     // One URL     { method: 'GET', url: 'http://example.com/a/b' },     // Batch import of URLs from a file hosted on the web     { method: 'POST', requestsFromUrl: 'http://example.com/urls.txt' }, ] ``` |
| [options.persistStateKey] | <code>String</code> |  | Identifies the key in the default key-value store under which the `RequestList` persists its state.   If this is set then `RequestList`   persists its state in regular intervals and loads the state from there in case it is restarted   due to an error or system reboot. |
| [options.state] | <code>Object</code> |  | The state object that the `RequestList` will be initialized from.   It is in the form as returned by `RequestList.getState()`, such as follows: ```javascript {     nextIndex: 5,     nextUniqueKey: 'unique-key-5'     inProgress: {         'unique-key-1': true,         'unique-key-4': true,     }, } ```   Note that the preferred (and simpler) way to persist the state of crawling of the `RequestList`   is to use the `persistStateKey` parameter instead. |
| [options.keepDuplicateUrls] | <code>Boolean</code> | <code>false</code> | By default, `RequestList` will deduplicate the provided URLs. Default deduplication is based   on the `uniqueKey` property of passed source [Request](Request) objects. If the property is not present,   it is generated by normalizing the URL. If present, it is kept intact. In any case, only one request per `uniqueKey` is added   to the `RequestList` resulting in removing of duplicate URLs / unique keys.   Setting `keepDuplicateUrls` to `true` will append an additional identifier to the `uniqueKey`   of each request that does not already include a `uniqueKey`. Therefore, duplicate   URLs will be kept in the list. It does not protect the user from having duplicates in user set   `uniqueKey`s however. It is the user's responsibility to ensure uniqueness of their unique keys,   if they wish to keep more than just a single copy in the `RequestList`. |

<a name="new_module.exports_new"></a>

### new module.exports(opts)

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| opts | <code>object</code> |  |  |
| opts.url | <code>String</code> |  | URL of the web page to crawl. |
| [opts.uniqueKey] | <code>String</code> |  | A unique key identifying the request. Two requests with the same `uniqueKey` are considered as pointing to the same URL. If `uniqueKey` is not provided, then it is automatically generated by normalizing the URL. For example, the URL of `HTTP://www.EXAMPLE.com/something/` will be generated the `uniqueKey` of `http://www.example.com/something`. The `keepUrlFragment` option determines whether URL hash fragment is included in the `uniqueKey` or not. Beware that the HTTP method and payload is not included in the `uniqueKey`, so requests to the same URL but with different HTTP methods or different POST payloads are all considered equal. You can set `uniqueKey` property to arbitrary non-empty text value in order to override the default behavior and specify which URLs shall be considered equal. |
| [opts.method] | <code>String</code> | <code>&#x27;GET&#x27;</code> |  |
| [opts.payload] | <code>String</code> \| <code>Buffer</code> |  | HTTP request payload, e.g. for POST requests. |
| [opts.retryCount] | <code>Number</code> | <code>0</code> | Indicates how many times the URL was retried in a case of error. |
| [opts.errorMessages] | <code>Array.&lt;String&gt;</code> |  | An array of error messages from request processing. |
| [opts.headers] | <code>String</code> | <code>{}</code> | HTTP headers. |
| [opts.userData] | <code>Object</code> | <code>{}</code> | Custom user data assigned to the request. |
| [opts.keepUrlFragment] | <code>Boolean</code> | <code>false</code> | If `false` then hash part is removed from the URL when computing the `uniqueKey` property.   For example, this causes the `http://www.example.com#foo` and `http://www.example.com#bar` URLs   to have the same `uniqueKey` of `http://www.example.com` and thus the URLs are considered equal.   Note that this option only has effect if `uniqueKey` is not set. |
| [opts.ignoreErrors] | <code>String</code> | <code>false</code> | If `true` then errors in processing of this will be ignored.   For example, the request won't be retried in a case of an error for example. |

<a name="new_module.exports_new"></a>

### new module.exports(options)

| Param | Type |
| --- | --- |
| options | <code>Object</code> | 
| options.newSettingsFunction | <code>function</code> | 
| options.maxUsages | <code>Number</code> | 


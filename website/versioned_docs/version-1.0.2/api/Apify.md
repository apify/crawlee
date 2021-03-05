---
id: version-1.0.2-apify
title: Apify
original_id: apify
---

<a name="apify"></a>

The following section describes all functions and properties provided by the `apify` package, except individual classes and namespaces that have their
separate, detailed, documentation pages accessible from the left sidebar. To learn how Apify SDK works, we suggest following the
[Getting Started](../guides/getting-started) tutorial.

**Important:**

> The following functions: `addWebhook`, `call`, `callTask` and `newClient` invoke features of the [Apify platform](../guides/apify-platform) and
> require your scripts to be authenticated. See the [authentication guide](../guides/apify-platform#logging-into-apify-platform-from-apify-sdk) for
> instructions.

---

<a name="addwebhook"></a>

## `Apify.addWebhook(options)`

Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed. For more information
about Apify actor webhooks, please see the [documentation](https://docs.apify.com/webhooks).

Note that webhooks are only supported for actors running on the Apify platform. In local environment, the function will print a warning and have no
effect.

**Parameters**:

-   **`options`**: `object`
    -   **`eventTypes`**: [`EventTypes`](../typedefs/event-types) - Array of event types, which you can set for actor run, see the
        [actor run events](https://docs.apify.com/webhooks/events#actor-run) in the Apify doc.
    -   **`requestUrl`**: `string` - URL which will be requested using HTTP POST request, when actor run will reach the set event type.
    -   **`[payloadTemplate]`**: `string` - Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
        It uses JSON syntax, extended with a double curly braces syntax for injecting variables `{{variable}}`. Those variables are resolved at the
        time of the webhook's dispatch, and a list of available variables with their descriptions is available in the
        [Apify webhook documentation](https://docs.apify.com/webhooks). If `payloadTemplate` is omitted, the default payload template is used
        ([view docs](https://docs.apify.com/webhooks/actions#payload-template)).
    -   **`[idempotencyKey]`**: `string` - Idempotency key enables you to ensure that a webhook will not be added multiple times in case of an actor
        restart or other situation that would cause the `addWebhook()` function to be called again. We suggest using the actor run ID as the
        idempotency key. You can get the run ID by calling [`Apify.getEnv()`](../api/apify#getenv) function.

**Returns**:

[`Promise<(WebhookRun|undefined)>`](../typedefs/webhook-run) - The return value is the Webhook object. For more information, see the
[Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.

---

<a name="call"></a>

## `Apify.call(actId, [input], [options])`

Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the actor to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](../typedefs/actor-run) object that contains details about the actor run and its output (if any). If the
actor run fails, the function throws the [`ApifyCallError`](../api/apify-call-error) exception.

If you want to run an actor task rather than an actor, please use the [`Apify.callTask()`](../api/apify#calltask) function instead.

For more information about actors, read the [documentation](https://docs.apify.com/actor).

**Example usage:**

```javascript
const run = await Apify.call('apify/hello-world', { myInput: 123 });
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `call()` function invokes the [Run actor](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor) and several other
API endpoints to obtain the output.

**Throws**:

-   [`ApifyCallError`](../api/apify-call-error) If the run did not succeed, e.g. if it failed or timed out.

**Parameters**:

-   **`actId`**: `string` - Allowed formats are `username/actor-name`, `userId/actor-name` or actor ID.
-   **`[input]`**: `Object<string, *>` - Input for the actor. If it is an object, it will be stringified to JSON and its content type set to
    `application/json; charset=utf-8`. Otherwise the `options.contentType` parameter must be provided.
-   **`[options]`**: `object` - Object with the settings below:
    -   **`[contentType]`**: `string` - Content type for the `input`. If not specified, `input` is expected to be an object that will be stringified
        to JSON and content type set to `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a `String` or
        `Buffer`.
    -   **`[token]`**: `string` - User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
    -   **`[memoryMbytes]`**: `number` - Memory in megabytes which will be allocated for the new actor run. If not provided, the run uses memory of
        the default actor run configuration.
    -   **`[timeoutSecs]`**: `number` - Timeout for the actor run in seconds. Zero value means there is no timeout. If not provided, the run uses
        timeout of the default actor run configuration.
    -   **`[build]`**: `string` - Tag or number of the actor build to run (e.g. `beta` or `1.2.345`). If not provided, the run uses build tag or
        number from the default actor run configuration (typically `latest`).
    -   **`[waitSecs]`**: `number` - Maximum time to wait for the actor run to finish, in seconds. If the limit is reached, the returned promise is
        resolved to a run object that will have status `READY` or `RUNNING` and it will not contain the actor run output. If `waitSecs` is null or
        undefined, the function waits for the actor to finish (default behavior).
    -   **`[fetchOutput]`**: `boolean` <code> = true</code> - If `false` then the function does not fetch output of the actor.
    -   **`[disableBodyParser]`**: `boolean` <code> = false</code> - If `true` then the function will not attempt to parse the actor's output and will
        return it in a raw `Buffer`.
    -   **`[webhooks]`**: [`Array<AdhocWebhook>`](../typedefs/adhoc-webhook) - Specifies optional webhooks associated with the actor run, which can be
        used to receive a notification e.g. when the actor finished or failed, see
        [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.

**Returns**:

[`Promise<ActorRun>`](../typedefs/actor-run)

---

<a name="calltask"></a>

## `Apify.callTask(taskId, [input], [options])`

Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the task to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](../typedefs/actor-run) object that contains details about the actor run and its output (if any). If the
actor run failed, the function fails with [`ApifyCallError`](../api/apify-call-error) exception.

Note that an actor task is a saved input configuration and options for an actor. If you want to run an actor directly rather than an actor task,
please use the [`Apify.call()`](../api/apify#call) function instead.

For more information about actor tasks, read the [documentation](https://docs.apify.com/tasks).

**Example usage:**

```javascript
const run = await Apify.callTask('bob/some-task');
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `callTask()` function calls the [Run task](https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task) and several
other API endpoints to obtain the output.

**Throws**:

-   [`ApifyCallError`](../api/apify-call-error) If the run did not succeed, e.g. if it failed or timed out.

**Parameters**:

-   **`taskId`**: `string` - Allowed formats are `username/task-name`, `userId/task-name` or task ID.
-   **`[input]`**: `Object<string, *>` - Input overrides for the actor task. If it is an object, it will be stringified to JSON and its content type
    set to `application/json; charset=utf-8`. Provided input will be merged with actor task input.
-   **`[options]`**: `object` - Object with the settings below:
    -   **`[token]`**: `string` - User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
    -   **`[memoryMbytes]`**: `number` - Memory in megabytes which will be allocated for the new actor task run. If not provided, the run uses memory
        of the default actor run configuration.
    -   **`[timeoutSecs]`**: `number` - Timeout for the actor task run in seconds. Zero value means there is no timeout. If not provided, the run uses
        timeout of the default actor run configuration.
    -   **`[build]`**: `string` - Tag or number of the actor build to run (e.g. `beta` or `1.2.345`). If not provided, the run uses build tag or
        number from the default actor run configuration (typically `latest`).
    -   **`[waitSecs]`**: `number` - Maximum time to wait for the actor task run to finish, in seconds. If the limit is reached, the returned promise
        is resolved to a run object that will have status `READY` or `RUNNING` and it will not contain the actor run output. If `waitSecs` is null or
        undefined, the function waits for the actor task to finish (default behavior).
    -   **`[webhooks]`**: [`Array<AdhocWebhook>`](../typedefs/adhoc-webhook) - Specifies optional webhooks associated with the actor run, which can be
        used to receive a notification e.g. when the actor finished or failed, see
        [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.

**Returns**:

[`Promise<ActorRun>`](../typedefs/actor-run)

---

<a name="createproxyconfiguration"></a>

## `Apify.createProxyConfiguration([proxyConfigurationOptions])`

Creates a proxy configuration and returns a promise resolving to an instance of the [`ProxyConfiguration`](../api/proxy-configuration) class that is
already initialized.

Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking your crawlers based
on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures them to use the selected proxies for
all connections.

For more details and code examples, see the [`ProxyConfiguration`](../api/proxy-configuration) class.

```javascript

// Returns initialized proxy configuration class
const proxyConfiguration = await Apify.createProxyConfiguration({
    groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
    countryCode: 'US'
});

const crawler = new Apify.CheerioCrawler({
  // ...
  proxyConfiguration,
  handlePageFunction: ({ proxyInfo }) => {
      const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
  }
})

```

For compatibility with existing Actor Input UI (Input Schema), this function returns `undefined` when the following object is passed as
`proxyConfigurationOptions`.

```
{ useApifyProxy: false }
```

**Parameters**:

-   **`[proxyConfigurationOptions]`**: [`ProxyConfigurationOptions`](../typedefs/proxy-configuration-options)

**Returns**:

[`Promise<(ProxyConfiguration|undefined)>`](../api/proxy-configuration)

---

<a name="events"></a>

## `Apify.events`

Gets an instance of a Node.js' [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter) class that emits various events from the
SDK or the Apify platform. The event emitter is initialized by calling the [`Apify.main()`](../api/apify#main) function.

**Example usage:**

```javascript
Apify.events.on('cpuInfo', data => {
    if (data.isCpuOverloaded) console.log('Oh no, the CPU is overloaded!');
});
```

The following events are emitted:

-   `cpuInfo`: `{ "isCpuOverloaded": Boolean }` The event is emitted approximately every second and it indicates whether the actor is using the
    maximum of available CPU resources. If that's the case, the actor should not add more workload. For example, this event is used by the
    [`AutoscaledPool`](../api/autoscaled-pool) class.
-   `migrating`: `void` Emitted when the actor running on the Apify platform is going to be migrated to another worker server soon. You can use it to
    persist the state of the actor and abort the run, to speed up migration. For example, this is used by the [`RequestList`](../api/request-list)
    class.
-   `persistState`: `{ "isMigrating": Boolean }` Emitted in regular intervals (by default 60 seconds) to notify all components of Apify SDK that it is
    time to persist their state, in order to avoid repeating all work when the actor restarts. This event is automatically emitted together with the
    `migrating` event, in which case the `isMigrating` flag is set to `true`. Otherwise the flag is `false`. Note that the `persistState` event is
    provided merely for user convenience, you can achieve the same effect using `setInterval()` and listening for the `migrating` event.

---

<a name="getenv"></a>

## `Apify.getEnv()`

Returns a new [`ApifyEnv`](../typedefs/apify-env) object which contains information parsed from all the `APIFY_XXX` environment variables.

For the list of the `APIFY_XXX` environment variables, see [Actor documentation](https://docs.apify.com/actor/run#environment-variables). If some of
the variables are not defined or are invalid, the corresponding value in the resulting object will be null.

**Returns**:

[`ApifyEnv`](../typedefs/apify-env)

---

<a name="getinput"></a>

## `Apify.getInput()`

Gets the actor input value from the default [`KeyValueStore`](../api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](key-value-store#getvalue). For example, calling the following code:

```javascript
const input = await Apify.getInput();
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.getValue('INPUT');
```

Note that the `getInput()` function does not cache the value read from the key-value store. If you need to use the input multiple times in your actor,
it is far more efficient to read it once and store it locally.

For more information, see [`Apify.openKeyValueStore()`](../api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](../api/key-value-store#getvalue).

**Returns**:

`Promise<(Object<string, *>|string|Buffer|null)>` - Returns a promise that resolves to an object, string or
[`Buffer`](https://nodejs.org/api/buffer.html), depending on the MIME content type of the record, or `null` if the record is missing.

---

<a name="getmemoryinfo"></a>

## `Apify.getMemoryInfo()`

Returns memory statistics of the process and the system, see [`MemoryInfo`](../typedefs/memory-info).

If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits, otherwise it gets system memory limits.

Beware that the function is quite inefficient because it spawns a new process. Therefore you shouldn't call it too often, like more than once per
second.

**Returns**:

[`Promise<MemoryInfo>`](../typedefs/memory-info)

---

<a name="getvalue"></a>

## `Apify.getValue(key)`

Gets a value from the default [`KeyValueStore`](../api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`KeyValueStore.getValue()`](../api/key-value-store#getvalue). For example, calling the following code:

```javascript
const value = await Apify.getValue('my-key');
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
const value = await store.getValue('my-key');
```

To store the value to the default key-value store, you can use the [`Apify.setValue()`](../api/apify#setvalue) function.

For more information, see [`Apify.openKeyValueStore()`](../api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](../api/key-value-store#getvalue).

**Parameters**:

-   **`key`**: `string` - Unique record key.

**Returns**:

`Promise<(Object<string, *>|string|Buffer|null)>` - Returns a promise that resolves to an object, string or
[`Buffer`](https://nodejs.org/api/buffer.html), depending on the MIME content type of the record, or `null` if the record is missing.

---

<a name="isathome"></a>

## `Apify.isAtHome()`

Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).

**Returns**:

`boolean`

---

<a name="launchplaywright"></a>

## `Apify.launchPlaywright([launchContext])`

Launches headless browsers using Playwright pre-configured to work within the Apify platform. The function has the same return value as
`browserType.launch()`. See <a href="https://playwright.dev/docs/api/class-browsertype" target="_blank"> Playwright documentation</a> for more
details.

The `launchPlaywright()` function alters the following Playwright options:

-   Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option, unless it was already defined by the caller or
    `APIFY_XVFB` environment variable is set to `1`. Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
-   Takes the `proxyUrl` option, validates it and adds it to `launchOptions` in a proper format. The proxy URL must define a port number and have one
    of the following schemes: `http://`, `https://`, `socks4://` or `socks5://`. If the proxy is HTTP (i.e. has the `http://` scheme) and contains
    username or password, the `launchPlaywright` functions sets up an anonymous proxy HTTP to make the proxy work with headless Chrome. For more
    information, read the
    <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
    target="_blank">blog post about proxy-chain library</a>.

To use this function, you need to have the [Playwright](https://www.npmjs.com/package/playwright) NPM package installed in your project. When running
on the Apify Platform, you can achieve that simply by using the `apify/actor-node-playwright-*` base Docker image for your actor - see
[Apify Actor documentation](https://docs.apify.com/actor/build#base-images) for details.

**Parameters**:

-   **`[launchContext]`**: [`PlaywrightLaunchContext`](../typedefs/playwright-launch-context) - Optional settings passed to `browserType.launch()`. In
    addition to [Playwright's options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions) the object may
    contain our own [`PlaywrightLaunchContext`](../typedefs/playwright-launch-context) that enable additional features.

**Returns**:

`Promise<*>` - Promise that resolves to Playwright's `Browser` instance.

---

<a name="launchpuppeteer"></a>

## `Apify.launchPuppeteer([launchContext])`

Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform. The function has the same argument and the return value as
`puppeteer.launch()`. See <a href="https://github.com/puppeteer/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank"> Puppeteer
documentation</a> for more details.

The `launchPuppeteer()` function alters the following Puppeteer options:

-   Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option, unless it was already defined by the caller or
    `APIFY_XVFB` environment variable is set to `1`. Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
-   Takes the `proxyUrl` option, validates it and adds it to `args` as `--proxy-server=XXX`. The proxy URL must define a port number and have one of
    the following schemes: `http://`, `https://`, `socks4://` or `socks5://`. If the proxy is HTTP (i.e. has the `http://` scheme) and contains
    username or password, the `launchPuppeteer` functions sets up an anonymous proxy HTTP to make the proxy work with headless Chrome. For more
    information, read the
    <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
    target="_blank">blog post about proxy-chain library</a>.

To use this function, you need to have the [puppeteer](https://www.npmjs.com/package/puppeteer) NPM package installed in your project. When running on
the Apify cloud, you can achieve that simply by using the `apify/actor-node-chrome` base Docker image for your actor - see
[Apify Actor documentation](https://docs.apify.com/actor/build#base-images) for details.

For an example of usage, see the [Synchronous run Example](../examples/synchronous-run) or the
[Puppeteer proxy Example](../examples/puppeteer-with-proxy)

**Parameters**:

-   **`[launchContext]`**: [`PuppeteerLaunchContext`](../typedefs/puppeteer-launch-context) - All `PuppeteerLauncher` parameters are passed via an
    launchContext object. If you want to pass custom `puppeteer.launch(options)` options you can use the `PuppeteerLaunchContext.launchOptions`
    property.

**Returns**:

`Promise<*>` - Promise that resolves to Puppeteer's `Browser` instance.

---

<a name="main"></a>

## `Apify.main(userFunc)`

Runs the main user function that performs the job of the actor and terminates the process when the user function finishes.

**The `Apify.main()` function is optional** and is provided merely for your convenience. It is mainly useful when you're running your code as an actor
on the [Apify platform](https://apify.com/actors). However, if you want to use Apify SDK tools directly inside your existing projects, e.g. running in
an [Express](https://expressjs.com/) server, on [Google Cloud functions](https://cloud.google.com/functions) or
[AWS Lambda](https://aws.amazon.com/lambda/), it's better to avoid it since the function terminates the main process when it finishes!

The `Apify.main()` function performs the following actions:

-   When running on the Apify platform (i.e. <code>APIFY_IS_AT_HOME</code> environment variable is set), it sets up a connection to listen for
    platform events. For example, to get a notification about an imminent migration to another server. See [`Apify.events`](../api/apify#events) for
    details.
-   It checks that either <code>APIFY_TOKEN</code> or <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable is defined. If not, the functions sets
    <code>APIFY_LOCAL_STORAGE_DIR</code> to <code>./apify_storage</code> inside the current working directory. This is to simplify running code
    examples.
-   It invokes the user function passed as the <code>userFunc</code> parameter.
-   If the user function returned a promise, waits for it to resolve.
-   If the user function throws an exception or some other error is encountered, prints error details to console so that they are stored to the log.
-   Exits the Node.js process, with zero exit code on success and non-zero on errors.

The user function can be synchronous:

```javascript
Apify.main(() => {
    // My synchronous function that returns immediately
    console.log('Hello world from actor!');
});
```

If the user function returns a promise, it is considered asynchronous:

```javascript
const { requestAsBrowser } = require('some-request-library');

Apify.main(() => {
    // My asynchronous function that returns a promise
    return request('http://www.example.com').then(html => {
        console.log(html);
    });
});
```

To simplify your code, you can take advantage of the `async`/`await` keywords:

```javascript
const request = require('some-request-library');

Apify.main(async () => {
    // My asynchronous function
    const html = await request('http://www.example.com');
    console.log(html);
});
```

**Parameters**:

-   **`userFunc`**: [`UserFunc`](../typedefs/user-func) - User function to be executed. If it returns a promise, the promise will be awaited. The user
    function is called with no arguments.

---

<a name="metamorph"></a>

## `Apify.metamorph(targetActorId, [input], [options])`

Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container instead. All the
default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.

**Parameters**:

-   **`targetActorId`**: `string` - Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
-   **`[input]`**: `Object<string, *>` - Input for the actor. If it is an object, it will be stringified to JSON and its content type set to
    `application/json; charset=utf-8`. Otherwise the `options.contentType` parameter must be provided.
-   **`[options]`**: `object` - Object with the settings below:
    -   **`[contentType]`**: `string` - Content type for the `input`. If not specified, `input` is expected to be an object that will be stringified
        to JSON and content type set to `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a `String` or
        `Buffer`.
    -   **`[build]`**: `string` - Tag or number of the target actor build to metamorph into (e.g. `beta` or `1.2.345`). If not provided, the run uses
        build tag or number from the default actor run configuration (typically `latest`).

**Returns**:

`Promise<void>`

---

<a name="newclient"></a>

## `Apify.newClient([options])`

Returns a new instance of the Apify API client. The `ApifyClient` class is provided by the
<a href="https://www.npmjs.com/package/apify-client" target="_blank">apify-client</a> NPM package, and it is automatically configured using the
`APIFY_API_BASE_URL`, and `APIFY_TOKEN` environment variables. You can override the token via the available options. That's useful if you want to use
the client as a different Apify user than the SDK internals are using.

**Parameters**:

-   **`[options]`**: `object`
    -   **`[token]`**: `string`
    -   **`[maxRetries]`**: `string`
    -   **`[minDelayBetweenRetriesMillis]`**: `string`

**Returns**:

[`ApifyClient`](../api/apify)

---

<a name="opendataset"></a>

## `Apify.openDataset([datasetIdOrName], [options])`

Opens a dataset and returns a promise resolving to an instance of the [`Dataset`](../api/dataset) class.

Datasets are used to store structured data where each object stored has the same attributes, such as online store products or real estate offers. The
actual data is stored either on the local filesystem or in the cloud.

For more details and code examples, see the [`Dataset`](../api/dataset) class.

**Parameters**:

-   **`[datasetIdOrName]`**: `string` - ID or name of the dataset to be opened. If `null` or `undefined`, the function returns the default dataset
    associated with the actor run.
-   **`[options]`**: `Object`
    -   **`[forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

**Returns**:

[`Promise<Dataset>`](../api/dataset)

---

<a name="openkeyvaluestore"></a>

## `Apify.openKeyValueStore([storeIdOrName], [options])`

Opens a key-value store and returns a promise resolving to an instance of the [`KeyValueStore`](../api/key-value-store) class.

Key-value stores are used to store records or files, along with their MIME content type. The records are stored and retrieved using a unique key. The
actual data is stored either on a local filesystem or in the Apify cloud.

For more details and code examples, see the [`KeyValueStore`](../api/key-value-store) class.

**Parameters**:

-   **`[storeIdOrName]`**: `string` - ID or name of the key-value store to be opened. If `null` or `undefined`, the function returns the default
    key-value store associated with the actor run.
-   **`[options]`**: `object`
    -   **`[forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

**Returns**:

[`Promise<KeyValueStore>`](../api/key-value-store)

---

<a name="openrequestlist"></a>

## `Apify.openRequestList(listName, sources, [options])`

Opens a request list and returns a promise resolving to an instance of the [`RequestList`](../api/request-list) class that is already initialized.

[`RequestList`](../api/request-list) represents a list of URLs to crawl, which is always stored in memory. To enable picking up where left off after a
process restart, the request list sources are persisted to the key-value store at initialization of the list. Then, while crawling, a small state
object is regularly persisted to keep track of the crawling status.

For more details and code examples, see the [`RequestList`](../api/request-list) class.

**Example usage:**

```javascript
const sources = ['https://www.example.com', 'https://www.google.com', 'https://www.bing.com'];

const requestList = await Apify.openRequestList('my-name', sources);
```

**Parameters**:

-   **`listName`**: `string` | `null` - Name of the request list to be opened. Setting a name enables the `RequestList`'s state to be persisted in the
    key-value store. This is useful in case of a restart or migration. Since `RequestList` is only stored in memory, a restart or migration wipes it
    clean. Setting a name will enable the `RequestList`'s state to survive those situations and continue where it left off.

    The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE` and `NAME-REQUEST_LIST_SOURCES`.

    If `null`, the list will not be persisted and will only be stored in memory. Process restart will then cause the list to be crawled again from the
    beginning. We suggest always using a name.

-   **`sources`**: [`Array<(RequestOptions|Request|string)>`](../typedefs/request-options) - An array of sources of URLs for the
    [`RequestList`](../api/request-list). It can be either an array of strings, plain objects that define at least the `url` property, or an array of
    [`Request`](../api/request) instances.

    **IMPORTANT:** The `sources` array will be consumed (left empty) after [`RequestList`](../api/request-list) initializes. This is a measure to
    prevent memory leaks in situations when millions of sources are added.

Additionally, the `requestsFromUrl` property may be used instead of `url`, which will instruct [`RequestList`](../api/request-list) to download the
source URLs from a given remote location. The URLs will be parsed from the received response. In this case you can limit the URLs using `regex`
parameter containing regular expression pattern for URLs to be included.

For details, see the [`RequestListOptions.sources`](../typedefs/request-list-options#sources)

-   **`[options]`**: [`RequestListOptions`](../typedefs/request-list-options) - The [`RequestList`](../api/request-list) options. Note that the
    `listName` parameter supersedes the [`RequestListOptions.persistStateKey`](../typedefs/request-list-options#persiststatekey) and
    [`RequestListOptions.persistRequestsKey`](../typedefs/request-list-options#persistrequestskey) options and the `sources` parameter supersedes the
    [`RequestListOptions.sources`](../typedefs/request-list-options#sources) option.

**Returns**:

[`Promise<RequestList>`](../api/request-list)

---

<a name="openrequestqueue"></a>

## `Apify.openRequestQueue([queueIdOrName], [options])`

Opens a request queue and returns a promise resolving to an instance of the [`RequestQueue`](../api/request-queue) class.

[`RequestQueue`](../api/request-queue) represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud. The queue is
used for deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports
both breadth-first and depth-first crawling orders.

For more details and code examples, see the [`RequestQueue`](../api/request-queue) class.

**Parameters**:

-   **`[queueIdOrName]`**: `string` - ID or name of the request queue to be opened. If `null` or `undefined`, the function returns the default request
    queue associated with the actor run.
-   **`[options]`**: `object`
    -   **`[forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

**Returns**:

[`Promise<RequestQueue>`](../api/request-queue)

---

<a name="opensessionpool"></a>

## `Apify.openSessionPool(sessionPoolOptions)`

Opens a SessionPool and returns a promise resolving to an instance of the [`SessionPool`](../api/session-pool) class that is already initialized.

For more details and code examples, see the [`SessionPool`](../api/session-pool) class.

**Parameters**:

-   **`sessionPoolOptions`**: [`SessionPoolOptions`](../typedefs/session-pool-options)

**Returns**:

[`Promise<SessionPool>`](../api/session-pool)

---

<a name="pushdata"></a>

## `Apify.pushData(item)`

Stores an object or an array of objects to the default [`Dataset`](../api/dataset) of the current actor run.

This is just a convenient shortcut for [`Dataset.pushData()`](../api/dataset#pushdata). For example, calling the following code:

```javascript
await Apify.pushData({ myValue: 123 });
```

is equivalent to:

```javascript
const dataset = await Apify.openDataset();
await dataset.pushData({ myValue: 123 });
```

For more information, see [`Apify.openDataset()`](../api/apify#opendataset) and [`Dataset.pushData()`](../api/dataset#pushdata)

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`, otherwise the actor process might finish before the data are stored!

**Parameters**:

-   **`item`**: `object` - Object or array of objects containing data to be stored in the default dataset. The objects must be serializable to JSON
    and the JSON representation of each object must be smaller than 9MB.

**Returns**:

`Promise<void>`

---

<a name="setvalue"></a>

## `Apify.setValue(key, value, [options])`

Stores or deletes a value in the default [`KeyValueStore`](../api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`KeyValueStore.setValue()`](../api/key-value-store#setvalue). For example, calling the following code:

```javascript
await Apify.setValue('OUTPUT', { foo: 'bar' });
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.setValue('OUTPUT', { foo: 'bar' });
```

To get a value from the default key-value store, you can use the [`Apify.getValue()`](../api/apify#getvalue) function.

For more information, see [`Apify.openKeyValueStore()`](../api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](../api/key-value-store#getvalue).

**Parameters**:

-   **`key`**: `string` - Unique record key.
-   **`value`**: `*` - Record data, which can be one of the following values:
    -   If `null`, the record in the key-value store is deleted.
    -   If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.
    -   If `options.contentType` is set, `value` is taken as is and it must be a `String` or [`Buffer`](https://nodejs.org/api/buffer.html). For any
        other value an error will be thrown.
-   **`[options]`**: `object`
    -   **`[contentType]`**: `string` - Specifies a custom MIME content type of the record.

**Returns**:

`Promise<void>`

---

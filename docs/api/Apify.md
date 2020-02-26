---
id: apify
title: Apify
---

<a name="apify"></a>

The following section describes all functions and properties provided by the `apify` package, except individual classes and namespaces that have their
separate, detailed, documentation pages accessible from the left sidebar. To learn how Apify SDK works, we suggest following the
[Getting Started](/docs/guides/getting-started) tutorial.

---

<a name="addwebhook"></a>

## `Apify.addWebhook(options)`

**Returns**: `Promise<object>` - The return value is the Webhook object. For more information, see the
[Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.

Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed. For more information
about Apify actor webhooks, please see the [documentation](https://docs.apify.com/webhooks).

Note that webhooks are only supported for actors running on the Apify platform. In local environment, the function will print a warning and have no
effect.

**Params**

-   **`options`**: `Object`

    -   **`.eventTypes`**: `Array<string>` - Array of event types, which you can set for actor run, see the
        [actor run events](https://docs.apify.com/webhooks/events#actor-run) in the Apify doc.
    -   **`.requestUrl`**: `string` - URL which will be requested using HTTP POST request, when actor run will reach the set event type.
    -   **`[.payloadTemplate]`**: `string` - Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
        It uses JSON syntax, extended with a double curly braces syntax for injecting variables `{{variable}}`. Those variables are resolved at the
        time of the webhook's dispatch, and a list of available variables with their descriptions is available in the
        [Apify webhook documentation](https://docs.apify.com/webhooks).

    When omitted, the default payload template will be used. [See the docs for the default payload template](https://docs.apify.com/webhooks).

    -   **`[.idempotencyKey]`**: `string` - Idempotency key enables you to ensure that a webhook will not be added multiple times in case of an actor
        restart or other situation that would cause the `addWebhook()` function to be called again. We suggest using the actor run ID as the
        idempotency key. You can get the run ID by calling [`Apify.getEnv()`](/docs/api/apify#getenv) function.

---

<a name="call"></a>

## `Apify.call(actId, [input], [options])`

**Returns**: [`Promise<ActorRun>`](/docs/typedefs/actor-run)

Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the actor to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](/docs/typedefs/actor-run) object that contains details about the actor run and its output (if any). If
the actor run fails, the function throws the [`ApifyCallError`](/docs/api/apify-call-error) exception.

If you want to run an actor task rather than an actor, please use the [`Apify.callTask()`](/docs/api/apify#calltask) function instead.

For more information about actors, read the [documentation](https://docs.apify.com/actor).

**Example usage:**

```javascript
const run = await Apify.call('apify/hello-world', { myInput: 123 });
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `call()` function invokes the [Run actor](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor) and several other
API endpoints to obtain the output.

**Throws**:

-   [`ApifyCallError`](/docs/api/apify-call-error) If the run did not succeed, e.g. if it failed or timed out.

**Params**

-   **`actId`**: `string` - Either `username/actor-name` or actor ID.
-   **`[input]`**: `object` - Input for the actor. If it is an object, it will be stringified to JSON and its content type set to
    `application/json; charset=utf-8`. Otherwise the `options.contentType` parameter must be provided.
-   **`[options]`**: `Object` <code> = {}</code> - Object with the settings below:
    -   **`[.contentType]`**: `string` - Content type for the `input`. If not specified, `input` is expected to be an object that will be stringified
        to JSON and content type set to `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a `String` or
        `Buffer`.
    -   **`[.token]`**: `string` - User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
    -   **`[.memoryMbytes]`**: `number` - Memory in megabytes which will be allocated for the new actor run. If not provided, the run uses memory of
        the default actor run configuration.
    -   **`[.timeoutSecs]`**: `number` - Timeout for the actor run in seconds. Zero value means there is no timeout. If not provided, the run uses
        timeout of the default actor run configuration.
    -   **`[.build]`**: `string` - Tag or number of the actor build to run (e.g. `beta` or `1.2.345`). If not provided, the run uses build tag or
        number from the default actor run configuration (typically `latest`).
    -   **`[.waitSecs]`**: `string` - Maximum time to wait for the actor run to finish, in seconds. If the limit is reached, the returned promise is
        resolved to a run object that will have status `READY` or `RUNNING` and it will not contain the actor run output. If `waitSecs` is null or
        undefined, the function waits for the actor to finish (default behavior).
    -   **`[.fetchOutput]`**: `boolean` <code> = true</code> - If `false` then the function does not fetch output of the actor.
    -   **`[.disableBodyParser]`**: `boolean` <code> = false</code> - If `true` then the function will not attempt to parse the actor's output and
        will return it in a raw `Buffer`.
    -   **`[.webhooks]`**: `Array<object>` - Specifies optional webhooks associated with the actor run, which can be used to receive a notification
        e.g. when the actor finished or failed, see [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed
        description.

---

<a name="calltask"></a>

## `Apify.callTask(taskId, [input], [options])`

**Returns**: [`Promise<ActorRun>`](/docs/typedefs/actor-run)

Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the task to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](/docs/typedefs/actor-run) object that contains details about the actor run and its output (if any). If
the actor run failed, the function fails with [`ApifyCallError`](/docs/api/apify-call-error) exception.

Note that an actor task is a saved input configuration and options for an actor. If you want to run an actor directly rather than an actor task,
please use the [`Apify.call()`](/docs/api/apify#call) function instead.

For more information about actor tasks, read the [documentation](https://docs.apify.com/tasks).

**Example usage:**

```javascript
const run = await Apify.callTask('bob/some-task');
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `callTask()` function calls the [Run task](https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task) and several
other API endpoints to obtain the output.

**Throws**:

-   [`ApifyCallError`](/docs/api/apify-call-error) If the run did not succeed, e.g. if it failed or timed out.

**Params**

-   **`taskId`**: `string` - Either `username/task-name` or task ID.
-   **`[input]`**: `object` - Input overrides for the actor task. If it is an object, it will be stringified to JSON and its content type set to
    `application/json; charset=utf-8`. Otherwise the `options.contentType` parameter must be provided. Provided input will be merged with actor task
    input.
-   **`[options]`**: `Object` <code> = {}</code> - Object with the settings below:
    -   **`[.contentType]`**: `string` - Content type for the `input`. If not specified, `input` is expected to be an object that will be stringified
        to JSON and content type set to `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a `String` or
        `Buffer`.
    -   **`[.token]`**: `string` - User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
    -   **`[.memoryMbytes]`**: `number` - Memory in megabytes which will be allocated for the new actor task run. If not provided, the run uses memory
        of the default actor run configuration.
    -   **`[.timeoutSecs]`**: `number` - Timeout for the actor task run in seconds. Zero value means there is no timeout. If not provided, the run
        uses timeout of the default actor run configuration.
    -   **`[.build]`**: `string` - Tag or number of the actor build to run (e.g. `beta` or `1.2.345`). If not provided, the run uses build tag or
        number from the default actor run configuration (typically `latest`).
    -   **`[.waitSecs]`**: `string` - Maximum time to wait for the actor task run to finish, in seconds. If the limit is reached, the returned promise
        is resolved to a run object that will have status `READY` or `RUNNING` and it will not contain the actor run output. If `waitSecs` is null or
        undefined, the function waits for the actor task to finish (default behavior).
    -   **`[.webhooks]`**: `Array<object>` - Specifies optional webhooks associated with the actor run, which can be used to receive a notification
        e.g. when the actor finished or failed, see [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed
        description.

---

<a name="client"></a>

## `Apify.client`

Gets the default instance of the `ApifyClient` class provided <a href="https://docs.apify.com/api/apify-client-js/latest"
target="_blank">apify-client</a> by the NPM package. The instance is created automatically by the Apify SDK and it is configured using the
`APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN` environment variables.

The instance is used for all underlying calls to the Apify API in functions such as [`Apify.getValue()`](/docs/api/apify#getvalue) or
[`Apify.call()`](/docs/api/apify#call). The settings of the client can be globally altered by calling the
<a href="https://docs.apify.com/api/apify-client-js/latest#ApifyClient-setOptions"
target="_blank">`Apify.client.setOptions()`</a> function. Beware that altering these settings might have unintended effects on the entire Apify SDK
package.

---

<a name="events"></a>

## `Apify.events`

Gets an instance of a Node.js' [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter) class that emits various events from the
SDK or the Apify platform. The event emitter is initialized by calling the [`Apify.main()`](/docs/api/apify#main) function.

**Example usage:**

```javascript
Apify.events.on('cpuInfo', data => {
    if (data.isCpuOverloaded) console.log('Oh no, the CPU is overloaded!');
});
```

The following table shows all currently emitted events:

<table>
    <thead>
        <tr>
            <th>Event name</th>
            <th>Data</th>
    </thead>
    <tbody>
        <tr>
            <td><code>cpuInfo</code></td>
            <td><code>{ "isCpuOverloaded": Boolean }</code></td>
        </tr>
        <tr>
            <td colspan="2">
                The event is emitted approximately every second
                and it indicates whether the actor is using the maximum of available CPU resources.
                If that's the case, the actor should not add more workload.
                For example, this event is used by the [`AutoscaledPool`](/docs/api/autoscaled-pool) class.
            </td>
        </tr>
        <tr>
            <td><code>migrating</code></td>
            <td>None</td>
        </tr>
        <tr>
            <td colspan="2">
                Emitted when the actor running on the Apify platform is going to be migrated to another worker server soon.
                You can use it to persist the state of the actor and abort the run, to speed up migration.
                For example, this is used by the [`RequestList`](/docs/api/request-list) class.
            </td>
        </tr>
        <tr>
            <td><code>persistState</code></td>
            <td><code>{ "isMigrating": Boolean }</code></td>
        </tr>
        <tr>
            <td colspan="2">
                Emitted in regular intervals (by default 60 seconds) to notify all components of Apify SDK that it is time to persist
                their state, in order to avoid repeating all work when the actor restarts.
                This event is automatically emitted together with the <code>migrating</code> event,
                in which case the <code>isMigrating</code> flag is set to <code>true</code>. Otherwise the flag is <code>false</code>.
                <br><br>
                Note that the <code>persistState</code> event is provided merely for user convenience,
                you can achieve the same effect using <code>setInterval()</code> and listening for the <code>migrating</code> event.
            </td>
        </tr>
    </tbody>
</table>

---

<a name="getapifyproxyurl"></a>

## `Apify.getApifyProxyUrl([options])`

**Returns**: `string` - Returns the proxy URL, e.g. `http://auto:my_password@proxy.apify.com:8000`.

Constructs an Apify Proxy URL using the specified settings. The proxy URL can be used from Apify actors, web browsers or any other HTTP proxy-enabled
applications.

For more information, see the [Apify Proxy](https://my.apify.com/proxy) page in the app or the [documentation](https://docs.apify.com/proxy).

**Params**

-   **`[options]`**: `Object` - Object with the props below:
    -   **`[.password]`**: `string` - User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable,
        which is automatically set by the system when running the actors on the Apify cloud, or when using the
        [Apify CLI](https://github.com/apifytech/apify-cli) package and the user previously logged in (called `apify login`).
    -   **`[.groups]`**: `Array<string>` - Array of Apify Proxy groups to be used. If not provided, the proxy will select the groups automatically.
    -   **`[.session]`**: `string` - Apify Proxy session identifier to be used by the Chrome browser. All HTTP requests going through the proxy with
        the same session identifier will use the same target proxy server (i.e. the same IP address), unless using Residential proxies. The identifier
        can only contain the following characters: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
    -   **`[.country]`**: `string` - If set and relevant proxies are available in your Apify account, all proxied requests will use IP addresses that
        are geolocated to the specified country. For example `GB` for IPs from Great Britain. Note that online services often have their own rules for
        handling geolocation and thus the country selection is a best attempt at geolocation, rather than a guaranteed hit. This parameter is
        optional, by default, each proxied request is assigned an IP address from a random country. The country code needs to be a two letter ISO
        country code. See the
        [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements). This parameter is
        optional, by default, the proxy uses all available proxy servers from all countries.

---

<a name="getenv"></a>

## `Apify.getEnv()`

**Returns**: [`ApifyEnv`](/docs/typedefs/apify-env)

Returns a new [`ApifyEnv`](/docs/typedefs/apify-env) object which contains information parsed from all the `APIFY_XXX` environment variables.

For the list of the `APIFY_XXX` environment variables, see [Actor documentation](https://docs.apify.com/actor/run#environment-variables). If some of
the variables are not defined or are invalid, the corresponding value in the resulting object will be null.

---

<a name="getinput"></a>

## `Apify.getInput()`

**Returns**: `Promise<(object|null)>` - Returns a promise that resolves once the record is stored.

Gets the actor input value from the default [`KeyValueStore`](/docs/api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](keyvaluestore#getvalue). For example, calling the following code:

```javascript
const input = await Apify.getInput();
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.getValue('INPUT');
```

For more information, see [`Apify.openKeyValueStore()`](/docs/api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](/docs/api/key-value-store#getvalue).

---

<a name="getmemoryinfo"></a>

## `Apify.getMemoryInfo()`

**Returns**: [`Promise<MemoryInfo>`](/docs/typedefs/memory-info)

Returns memory statistics of the process and the system, see [`MemoryInfo`](/docs/typedefs/memory-info).

If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits, otherwise it gets system memory limits.

Beware that the function is quite inefficient because it spawns a new process. Therefore you shouldn't call it too often, like more than once per
second.

---

<a name="getvalue"></a>

## `Apify.getValue(key)`

**Returns**: `Promise<(object|null)>` - Returns a promise that resolves once the record is stored.

Gets a value from the default [`KeyValueStore`](/docs/api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`KeyValueStore.getValue()`](/docs/api/key-value-store#getvalue). For example, calling the following code:

```javascript
const value = await Apify.getValue('my-key');
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
const value = await store.getValue('my-key');
```

To store the value to the default-key value store, you can use the [`Apify.setValue()`](/docs/api/apify#setvalue) function.

For more information, see [`Apify.openKeyValueStore()`](/docs/api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](/docs/api/key-value-store#getvalue).

**Params**

-   **`key`**: `string` - Unique record key.

---

<a name="isathome"></a>

## `Apify.isAtHome()`

**Returns**: `boolean`

Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).

---

<a name="launchpuppeteer"></a>

## `Apify.launchPuppeteer([options])`

**Returns**: `Promise<Browser>` - Promise that resolves to Puppeteer's `Browser` instance.

Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform. The function has the same argument and the return value as
`puppeteer.launch()`. See <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
Puppeteer documentation</a> for more details.

The `launchPuppeteer()` function alters the following Puppeteer options:

<ul>
   <li>
       Passes the setting from the <code>APIFY_HEADLESS</code> environment variable to the <code>headless</code> option,
       unless it was already defined by the caller or <code>APIFY_XVFB</code> environment variable is set to <code>1</code>.
       Note that Apify Actor cloud platform automatically sets <code>APIFY_HEADLESS=1</code> to all running actors.
   </li>
   <li>
       Takes the <code>proxyUrl</code> option, validates it and adds it to <code>args</code> as <code>--proxy-server=XXX</code>.
       The proxy URL must define a port number and have one of the following schemes: <code>http://</code>,
       <code>https://</code>, <code>socks4://</code> or <code>socks5://</code>.
       If the proxy is HTTP (i.e. has the <code>http://</code> scheme) and contains username or password,
       the <code>launchPuppeteer</code> functions sets up an anonymous proxy HTTP
       to make the proxy work with headless Chrome. For more information, read the
       <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
       target="_blank">blog post about proxy-chain library</a>.
   </li>
   <li>
       If <code>options.useApifyProxy</code> is <code>true</code> then the function generates a URL of
       [Apify Proxy](https://docs.apify.com/proxy)
       based on <code>options.apifyProxyGroups</code> and <code>options.apifyProxySession</code> and passes it as <code>options.proxyUrl</code>.
   </li>
   <li>
       The function adds <code>--no-sandbox</code> to <code>args</code> to enable running
       headless Chrome in a Docker container on the Apify platform.
   </li>
   <li>
       Sets <code>defaultViewport</code> Puppeteer option (if not already set)
       to a more reasonable default for screenshots and debugging.
       You can set <code>options.defaultViewport</code> to <code>null</code> if you prefer to let Puppeteer
       choose the default viewport size.
   </li>
</ul>

To use this function, you need to have the [puppeteer](https://www.npmjs.com/package/puppeteer) NPM package installed in your project. When running on
the Apify cloud, you can achieve that simply by using the `apify/actor-node-chrome` base Docker image for your actor - see
[Apify Actor documentation](https://docs.apify.com/actor/build#base-images) for details.

For an example of usage, see the [Synchronous run Example](../examples/synchronousrun) or the
[Puppeteer proxy Example](../examples/puppeteerwithproxy)

**Params**

-   **`[options]`**: [`LaunchPuppeteerOptions`](/docs/typedefs/launch-puppeteer-options) - Optional settings passed to `puppeteer.launch()`. In
    addition to [Puppeteer's options](https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions) the object may contain our own
    [`LaunchPuppeteerOptions`](/docs/typedefs/launch-puppeteer-options) that enable additional features.

---

<a name="main"></a>

## `Apify.main(userFunc)`

Runs the main user function that performs the job of the actor and terminates the process when the user function finishes.

**The `Apify.main()` function is optional** and is provided merely for your convenience. It is mainly useful when you're running your code as an actor
on the [Apify platform](https://apify.com/actors). However, if you want to use Apify SDK tools directly inside your existing projects, e.g. running in
an [Express](https://expressjs.com/) server, on [Google Cloud functions](https://cloud.google.com/functions) or
[AWS Lambda](https://aws.amazon.com/lambda/), it's better to avoid it since the function terminates the main process when it finishes!

The `Apify.main()` function performs the following actions:

<ol>
  <li>When running on the Apify platform (i.e. <code>APIFY_IS_AT_HOME</code> environment variable is set),
  it sets up a connection to listen for platform events.
  For example, to get a notification about an imminent migration to another server.
  See [](apify#apifyevents) for details.
  </li>
  <li>It checks that either <code>APIFY_TOKEN</code> or <code>APIFY_LOCAL_STORAGE_DIR</code> environment variable
  is defined. If not, the functions sets <code>APIFY_LOCAL_STORAGE_DIR</code> to <code>./apify_storage</code>
  inside the current working directory. This is to simplify running code examples.
  </li>
  <li>It invokes the user function passed as the <code>userFunc</code> parameter.</li>
  <li>If the user function returned a promise, waits for it to resolve.</li>
  <li>If the user function throws an exception or some other error is encountered,
      prints error details to console so that they are stored to the log.</li>
  <li>Exits the Node.js process, with zero exit code on success and non-zero on errors.</li>
</ol>

The user function can be synchronous:

```javascript
Apify.main(() => {
    // My synchronous function that returns immediately
    console.log('Hello world from actor!');
});
```

If the user function returns a promise, it is considered asynchronous:

```javascript
const request = require('request-promise-native');

Apify.main(() => {
    // My asynchronous function that returns a promise
    return request('http://www.example.com').then(html => {
        console.log(html);
    });
});
```

To simplify your code, you can take advantage of the `async`/`await` keywords:

```javascript
const request = require('request-promise-native');

Apify.main(async () => {
    // My asynchronous function
    const html = await request('http://www.example.com');
    console.log(html);
});
```

**Params**

-   **`userFunc`**: [`UserFunc`](/docs/typedefs/user-func) - User function to be executed. If it returns a promise, the promise will be awaited. The
    user function is called with no arguments.

---

<a name="metamorph"></a>

## `Apify.metamorph(targetActorId, [input], [options])`

**Returns**: `Promise<void>`

Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container instead. All the
default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.

**Params**

-   **`targetActorId`**: `string` - Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
-   **`[input]`**: `object` - Input for the actor. If it is an object, it will be stringified to JSON and its content type set to
    `application/json; charset=utf-8`. Otherwise the `options.contentType` parameter must be provided.
-   **`[options]`**: `Object` <code> = {}</code> - Object with the settings below:
    -   **`[.contentType]`**: `string` - Content type for the `input`. If not specified, `input` is expected to be an object that will be stringified
        to JSON and content type set to `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a `String` or
        `Buffer`.
    -   **`[.build]`**: `string` - Tag or number of the target actor build to metamorph into (e.g. `beta` or `1.2.345`). If not provided, the run uses
        build tag or number from the default actor run configuration (typically `latest`).

---

<a name="opendataset"></a>

## `Apify.openDataset([datasetIdOrName], [options])`

**Returns**: [`Promise<Dataset>`](/docs/api/dataset)

Opens a dataset and returns a promise resolving to an instance of the [`Dataset`](/docs/api/dataset) class.

Datasets are used to store structured data where each object stored has the same attributes, such as online store products or real estate offers. The
actual data is stored either on the local filesystem or in the cloud.

For more details and code examples, see the [`Dataset`](/docs/api/dataset) class.

**Params**

-   **`[datasetIdOrName]`**: `string` - ID or name of the dataset to be opened. If `null` or `undefined`, the function returns the default dataset
    associated with the actor run.
-   **`[options]`**: `Object`
    -   **`[.forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

---

<a name="openkeyvaluestore"></a>

## `Apify.openKeyValueStore([storeIdOrName], [options])`

**Returns**: [`Promise<KeyValueStore>`](/docs/api/key-value-store)

Opens a key-value store and returns a promise resolving to an instance of the [`KeyValueStore`](/docs/api/key-value-store) class.

Key-value stores are used to store records or files, along with their MIME content type. The records are stored and retrieved using a unique key. The
actual data is stored either on a local filesystem or in the Apify cloud.

For more details and code examples, see the [`KeyValueStore`](/docs/api/key-value-store) class.

**Params**

-   **`[storeIdOrName]`**: `string` - ID or name of the key-value store to be opened. If `null` or `undefined`, the function returns the default
    key-value store associated with the actor run.
-   **`[options]`**: `object`
    -   **`[.forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

---

<a name="openrequestlist"></a>

## `Apify.openRequestList(listName, sources, [options])`

**Returns**: [`Promise<RequestList>`](/docs/api/request-list)

Opens a request list and returns a promise resolving to an instance of the [`RequestList`](/docs/api/request-list) class that is already initialized.

[`RequestList`](/docs/api/request-list) represents a list of URLs to crawl, which is always stored in memory. To enable picking up where left off
after a process restart, the request list sources are persisted to the key value store at initialization of the list. Then, while crawling, a small
state object is regularly persisted to keep track of the crawling status.

For more details and code examples, see the [`RequestList`](/docs/api/request-list) class.

**Example usage:**

```javascript
const sources = ['https://www.example.com', 'https://www.google.com', 'https://www.bing.com'];

const requestList = await Apify.openRequestList('my-name', sources);
```

**Params**

-   **`listName`**: `string` | `null` - Name of the request list to be opened. Setting a name enables the `RequestList`'s state to be persisted in the
    key value store. This is useful in case of a restart or migration. Since `RequestList` is only stored in memory, a restart or migration wipes it
    clean. Setting a name will enable the `RequestList`'s state to survive those situations and continue where it left off.

    The name will be used as a prefix in key value store, producing keys such as `NAME-REQUEST_LIST_STATE` and `NAME-REQUEST_LIST_SOURCES`.

    If `null`, the list will not be persisted and will only be stored in memory. Process restart will then cause the list to be crawled again from the
    beginning. We suggest always using a name.

-   **`sources`**: [`SourceInput`](/docs/typedefs/source-input) | `Array<string>` - An array of sources of URLs for the
    [`RequestList`](/docs/api/request-list). It can be either an array of plain objects that define at least the `url` property, or an array of
    instances of the [`Request`](/docs/api/request) class.

Additionally, the `requestsFromUrl` property may be used instead of `url`, which will instruct [`RequestList`](/docs/api/request-list) to download the
source URLs from a given remote location. The URLs will be parsed from the received response. In this case you can limit the URLs using `regex`
parameter containing regular expression pattern for URLs to be included.

For details, see the [`RequestListOptions.sources`](/docs/typedefs/request-list-options#sources)

-   **`[options]`**: [`RequestListOptions`](/docs/typedefs/request-list-options) - The [`RequestList`](/docs/api/request-list) options. Note that the
    `listName` parameter supersedes the [`RequestListOptions.persistStateKey`](/docs/typedefs/request-list-options#persiststatekey) and
    [`RequestListOptions.persistSourcesKey`](/docs/typedefs/request-list-options#persistsourceskey) options and the `sources` parameter supersedes the
    [`RequestListOptions.sources`](/docs/typedefs/request-list-options#sources) option.

---

<a name="openrequestqueue"></a>

## `Apify.openRequestQueue([queueIdOrName], [options])`

**Returns**: [`Promise<RequestQueue>`](/docs/api/request-queue)

Opens a request queue and returns a promise resolving to an instance of the [`RequestQueue`](/docs/api/request-queue) class.

[`RequestQueue`](/docs/api/request-queue) represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud. The queue
is used for deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports
both breadth-first and depth-first crawling orders.

For more details and code examples, see the [`RequestQueue`](/docs/api/request-queue) class.

**Params**

-   **`[queueIdOrName]`**: `string` - ID or name of the request queue to be opened. If `null` or `undefined`, the function returns the default request
    queue associated with the actor run.
-   **`[options]`**: `object`
    -   **`[.forceCloud]`**: `boolean` <code> = false</code> - If set to `true` then the function uses cloud storage usage even if the
        `APIFY_LOCAL_STORAGE_DIR` environment variable is set. This way it is possible to combine local and cloud storage.

---

<a name="opensessionpool"></a>

## `Apify.openSessionPool(sessionPoolOptions)`

**Returns**: [`Promise<SessionPool>`](/docs/api/session-pool)

Opens a SessionPool and returns a promise resolving to an instance of the [`SessionPool`](/docs/api/session-pool) class that is already initialized.

For more details and code examples, see the [`SessionPool`](/docs/api/session-pool) class.

**Params**

-   **`sessionPoolOptions`**: [`SessionPoolOptions`](/docs/typedefs/session-pool-options)

---

<a name="pushdata"></a>

## `Apify.pushData(item)`

**Returns**: `Promise<void>`

Stores an object or an array of objects to the default [`Dataset`](/docs/api/dataset) of the current actor run.

This is just a convenient shortcut for [`Dataset.pushData()`](/docs/api/dataset#pushdata). For example, calling the following code:

```javascript
await Apify.pushData({ myValue: 123 });
```

is equivalent to:

```javascript
const dataset = await Apify.openDataset();
await dataset.pushData({ myValue: 123 });
```

For more information, see [`Apify.openDataset()`](/docs/api/apify#opendataset) and [`Dataset.pushData()`](/docs/api/dataset#pushdata)

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`, otherwise the actor process might finish before the data are stored!

**Params**

-   **`item`**: `object` - Object or array of objects containing data to be stored in the default dataset. The objects must be serializable to JSON
    and the JSON representation of each object must be smaller than 9MB.

---

<a name="setvalue"></a>

## `Apify.setValue(key, value, [options])`

**Returns**: `Promise<void>`

Stores or deletes a value in the default [`KeyValueStore`](/docs/api/key-value-store) associated with the current actor run.

This is just a convenient shortcut for [`KeyValueStore.setValue()`](/docs/api/key-value-store#setvalue). For example, calling the following code:

```javascript
await Apify.setValue('OUTPUT', { foo: 'bar' });
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.setValue('OUTPUT', { foo: 'bar' });
```

To get a value from the default-key value store, you can use the [`Apify.getValue()`](/docs/api/apify#getvalue) function.

For more information, see [`Apify.openKeyValueStore()`](/docs/api/apify#openkeyvaluestore) and
[`KeyValueStore.getValue()`](/docs/api/key-value-store#getvalue).

**Params**

-   **`key`**: `string` - Unique record key.
-   **`value`**: `object` - Record data, which can be one of the following values:
    <ul>
      <li>If `null`, the record in the key-value store is deleted.</li>
      <li>If no `options.contentType` is specified, `value` can be any JavaScript object and it will be stringified to JSON.</li>
      <li>If `options.contentType` is specified, `value` is considered raw data and it must be a `String`
      or [](https://nodejs.org/api/buffer.html).</li>
    </ul>
    For any other value an error will be thrown.
-   **`[options]`**: `Object`
    -   **`[.contentType]`**: `string` - Specifies a custom MIME content type of the record.

---

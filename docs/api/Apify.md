---
id: apify
title: Apify
---

<a name="module_Apify"></a>

The following section describes all functions and properties provided by the `apify` package, except individual classes and namespaces that have their
separate, detailed, documentation pages accessible from the left sidebar.

-   [Apify](#module_Apify)
    -   [`.addWebhook(options)`](#module_Apify.addWebhook) ⇒ `Promise<Object>`
    -   [`.call(actId, [input], [options])`](#module_Apify.call) ⇒ [`Promise<ActorRun>`](../typedefs/actorrun)
    -   [`.callTask(taskId, [input], [options])`](#module_Apify.callTask) ⇒ [`Promise<ActorRun>`](../typedefs/actorrun)
    -   [`.client`](#module_Apify.client) : `*`
    -   [`.events`](#module_Apify.events)
    -   [`.getApifyProxyUrl(options)`](#module_Apify.getApifyProxyUrl) ⇒ `String`
    -   [`.getEnv()`](#module_Apify.getEnv) ⇒ [`ApifyEnv`](../typedefs/apifyenv)
    -   [`.getInput`](#module_Apify.getInput) ⇒ `Promise<Object>`
    -   [`.getMemoryInfo()`](#module_Apify.getMemoryInfo) ⇒ [`Promise<MemoryInfo>`](../typedefs/memoryinfo)
    -   [`.getValue(key)`](#module_Apify.getValue) ⇒ `Promise<Object>`
    -   [`.isAtHome()`](#module_Apify.isAtHome) ⇒ `Boolean`
    -   [`.launchPuppeteer([options])`](#module_Apify.launchPuppeteer) ⇒ `Promise<Browser>`
    -   [`.main(userFunc)`](#module_Apify.main)
    -   [`.metamorph(targetActorId, [input], [options])`](#module_Apify.metamorph) ⇒ `Promise<void>`
    -   [`.openDataset([datasetIdOrName], [options])`](#module_Apify.openDataset) ⇒ [`Promise<Dataset>`](dataset)
    -   [`.openKeyValueStore([storeIdOrName], [options])`](#module_Apify.openKeyValueStore) ⇒ [`Promise<KeyValueStore>`](keyvaluestore)
    -   [`.openRequestList`](#module_Apify.openRequestList) ⇒ [`Promise<RequestList>`](requestlist)
    -   [`.openRequestQueue`](#module_Apify.openRequestQueue) ⇒ [`Promise<RequestQueue>`](requestqueue)
    -   [`.openSessionPool`](#module_Apify.openSessionPool) ⇒ [`Promise<SessionPool>`](sessionpool)
    -   [`.pushData(item)`](#module_Apify.pushData) ⇒ `Promise`
    -   [`.setValue(key, value, [options])`](#module_Apify.setValue) ⇒ `Promise`

<a name="module_Apify.addWebhook"></a>

## `Apify.addWebhook(options)` ⇒ `Promise<Object>`

Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed. For more information
about Apify actor webhooks, please see the <a href="https://docs.apify.com/webhooks" target="_blank">documentation</a>.

Note that webhooks are only supported for actors running on the Apify platform. In local environment, the function will print a warning and have no
effect.

**Returns**: `Promise<Object>` - The return value is the Webhook object. For more information, see the
[Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>options.eventTypes</code></td><td><code>Array<string></code></td>
</tr>
<tr>
<td colspan="3"><p>Array of event types, which you can set for actor run, see
  the <a href="https://docs.apify.com/webhooks/events#actor-run" target="_blank">actor run events</a> in the Apify doc.</p>
</td></tr><tr>
<td><code>options.requestUrl</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>URL which will be requested using HTTP POST request, when actor run will reach the set event type.</p>
</td></tr><tr>
<td><code>[options.payloadTemplate]</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
  It uses JSON syntax, extended with a double curly braces syntax for injecting variables <code>{{variable}}</code>.
  Those variables are resolved at the time of the webhook&#39;s dispatch, and a list of available variables with their descriptions
  is available in the <a href="https://docs.apify.com/webhooks" target="_blank">Apify webhook documentation</a>.</p>
<p>  When omitted, the default payload template will be used.
  <a href="https://docs.apify.com/webhooks" target="_blank">See the docs for the default payload template</a>.</p>
</td></tr><tr>
<td><code>[options.idempotencyKey]</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>Idempotency key enables you to ensure that a webhook will not be added multiple times in case of
  an actor restart or other situation that would cause the <code>addWebhook()</code> function to be called again.
  We suggest using the actor run ID as the idempotency key. You can get the run ID by calling
  <a href="apify#module_Apify.getEnv"><code>Apify.getEnv()</code></a> function.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.call"></a>

## `Apify.call(actId, [input], [options])` ⇒ [`Promise<ActorRun>`](../typedefs/actorrun)

Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the actor to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](../typedefs/actorrun) object that contains details about the actor run and its output (if any). If the
actor run fails, the function throws the [`ApifyCallError`](../typedefs/apifycallerror) exception.

If you want to run an actor task rather than an actor, please use the [`Apify.callTask()`](../api/apify#module_Apify.callTask) function instead.

For more information about actors, read the <a href="https://docs.apify.com/actor" target="_blank">documentation</a>.

**Example usage:**

```javascript
const run = await Apify.call('apify/hello-world', { myInput: 123 });
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `call()` function invokes the <a href="https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Run
actor</a> and several other API endpoints to obtain the output.

**Throws**:

-   [`ApifyCallError`](../typedefs/apifycallerror) If the run did not succeed, e.g. if it failed or timed out.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>actId</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Either <code>username/actor-name</code> or actor ID.</p>
</td></tr><tr>
<td><code>[input]</code></td><td><code>Object</code> | <code>String</code> | <code>Buffer</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Input for the actor. If it is an object, it will be stringified to
 JSON and its content type set to <code>application/json; charset=utf-8</code>.
 Otherwise the <code>options.contentType</code> parameter must be provided.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Object with the settings below:</p>
</td></tr><tr>
<td><code>[options.contentType]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Content type for the <code>input</code>. If not specified,
 <code>input</code> is expected to be an object that will be stringified to JSON and content type set to
 <code>application/json; charset=utf-8</code>. If <code>options.contentType</code> is specified, then <code>input</code> must be a
 <code>String</code> or <code>Buffer</code>.</p>
</td></tr><tr>
<td><code>[options.token]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>User API token that is used to run the actor. By default, it is taken from the <code>APIFY_TOKEN</code> environment variable.</p>
</td></tr><tr>
<td><code>[options.memoryMbytes]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Memory in megabytes which will be allocated for the new actor run.
 If not provided, the run uses memory of the default actor run configuration.</p>
</td></tr><tr>
<td><code>[options.timeoutSecs]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Timeout for the actor run in seconds. Zero value means there is no timeout.
 If not provided, the run uses timeout of the default actor run configuration.</p>
</td></tr><tr>
<td><code>[options.build]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Tag or number of the actor build to run (e.g. <code>beta</code> or <code>1.2.345</code>).
 If not provided, the run uses build tag or number from the default actor run configuration (typically <code>latest</code>).</p>
</td></tr><tr>
<td><code>[options.waitSecs]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Maximum time to wait for the actor run to finish, in seconds.
 If the limit is reached, the returned promise is resolved to a run object that will have
 status <code>READY</code> or <code>RUNNING</code> and it will not contain the actor run output.
 If <code>waitSecs</code> is null or undefined, the function waits for the actor to finish (default behavior).</p>
</td></tr><tr>
<td><code>[options.fetchOutput]</code></td><td><code>Boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>false</code> then the function does not fetch output of the actor.</p>
</td></tr><tr>
<td><code>[options.disableBodyParser]</code></td><td><code>Boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code> then the function will not attempt to parse the
 actor&#39;s output and will return it in a raw <code>Buffer</code>.</p>
</td></tr><tr>
<td><code>[options.webhooks]</code></td><td><code>Array</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Specifies optional webhooks associated with the actor run, which can be used
 to receive a notification e.g. when the actor finished or failed, see
 <a href="https://docs.apify.com/webhooks/ad-hoc-webhooks">ad hook webhooks documentation</a> for detailed description.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.callTask"></a>

## `Apify.callTask(taskId, [input], [options])` ⇒ [`Promise<ActorRun>`](../typedefs/actorrun)

Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable), waits for the task to
finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish. If the value is less than or equal to zero,
the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](../typedefs/actorrun) object that contains details about the actor run and its output (if any). If the
actor run failed, the function fails with [`ApifyCallError`](../typedefs/apifycallerror) exception.

Note that an actor task is a saved input configuration and options for an actor. If you want to run an actor directly rather than an actor task,
please use the [`Apify.call()`](../api/apify#module_Apify.call) function instead.

For more information about actor tasks, read the [`documentation`](https://docs.apify.com/tasks).

**Example usage:**

```javascript
const run = await Apify.callTask('bob/some-task');
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `callTask()` function calls the
<a href="https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task" target="_blank">Run task</a> and several other API endpoints to
obtain the output.

**Throws**:

-   [`ApifyCallError`](../typedefs/apifycallerror) If the run did not succeed, e.g. if it failed or timed out.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>taskId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Either <code>username/task-name</code> or task ID.</p>
</td></tr><tr>
<td><code>[input]</code></td><td><code>Object</code> | <code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>Input overrides for the actor task. If it is an object, it will be stringified to
 JSON and its content type set to <code>application/json; charset=utf-8</code>.
 Otherwise the <code>options.contentType</code> parameter must be provided.
 Provided input will be merged with actor task input.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object with the settings below:</p>
</td></tr><tr>
<td><code>[options.contentType]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Content type for the <code>input</code>. If not specified,
 <code>input</code> is expected to be an object that will be stringified to JSON and content type set to
 <code>application/json; charset=utf-8</code>. If <code>options.contentType</code> is specified, then <code>input</code> must be a
 <code>String</code> or <code>Buffer</code>.</p>
</td></tr><tr>
<td><code>[options.token]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>User API token that is used to run the actor. By default, it is taken from the <code>APIFY_TOKEN</code> environment variable.</p>
</td></tr><tr>
<td><code>[options.memoryMbytes]</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Memory in megabytes which will be allocated for the new actor task run.
 If not provided, the run uses memory of the default actor run configuration.</p>
</td></tr><tr>
<td><code>[options.timeoutSecs]</code></td><td><code>Number</code></td>
</tr>
<tr>
<td colspan="3"><p>Timeout for the actor task run in seconds. Zero value means there is no timeout.
 If not provided, the run uses timeout of the default actor run configuration.</p>
</td></tr><tr>
<td><code>[options.build]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Tag or number of the actor build to run (e.g. <code>beta</code> or <code>1.2.345</code>).
 If not provided, the run uses build tag or number from the default actor run configuration (typically <code>latest</code>).</p>
</td></tr><tr>
<td><code>[options.waitSecs]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Maximum time to wait for the actor task run to finish, in seconds.
 If the limit is reached, the returned promise is resolved to a run object that will have
 status <code>READY</code> or <code>RUNNING</code> and it will not contain the actor run output.
 If <code>waitSecs</code> is null or undefined, the function waits for the actor task to finish (default behavior).</p>
</td></tr><tr>
<td><code>[options.webhooks]</code></td><td><code>Array</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies optional webhooks associated with the actor run, which can be used
 to receive a notification e.g. when the actor finished or failed, see
 <a href="https://docs.apify.com/webhooks/ad-hoc-webhooks">ad hook webhooks documentation</a> for detailed description.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.client"></a>

## `Apify.client` : `*`

Gets the default instance of the `ApifyClient` class provided <a href="https://docs.apify.com/api/apify-client-js/latest"
target="_blank">apify-client</a> by the NPM package. The instance is created automatically by the Apify SDK and it is configured using the
`APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN` environment variables.

The instance is used for all underlying calls to the Apify API in functions such as [`Apify.getValue()`](#module_Apify.getValue) or
[`Apify.call()`](#module_Apify.call). The settings of the client can be globally altered by calling the
<a href="https://docs.apify.com/api/apify-client-js/latest#ApifyClient-setOptions"
target="_blank">`Apify.client.setOptions()`</a> function. Beware that altering these settings might have unintended effects on the entire Apify SDK
package.

<a name="module_Apify.events"></a>

## `Apify.events`

Gets an instance of a Node.js' <a href="https://nodejs.org/api/events.html#events_class_eventemitter" target="_blank">EventEmitter</a> class that
emits various events from the SDK or the Apify platform. The event emitter is initialized by calling the [`Apify.main()`](#module_Apify.main)
function.

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
                For example, this event is used by the <a href="autoscaledpool"><code>AutoscaledPool</code></a> class.
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
                For example, this is used by the <a href="requestlist"><code>RequestList</code></a> class.
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

<a name="module_Apify.getApifyProxyUrl"></a>

## `Apify.getApifyProxyUrl(options)` ⇒ `String`

Constructs an Apify Proxy URL using the specified settings. The proxy URL can be used from Apify actors, web browsers or any other HTTP proxy-enabled
applications.

For more information, see the <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> page in the app or the
<a href="https://docs.apify.com/proxy" target="_blank">documentation</a>.

**Returns**: `String` - Returns the proxy URL, e.g. `http://auto:my_password@proxy.apify.com:8000`.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>options</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object with the settings below:</p>
</td></tr><tr>
<td><code>[options.password]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>User&#39;s password for the proxy.
  By default, it is taken from the <code>APIFY_PROXY_PASSWORD</code> environment variable,
  which is automatically set by the system when running the actors on the Apify cloud,
  or when using the <a href="https://github.com/apifytech/apify-cli" target="_blank">Apify CLI</a>
  package and the user previously logged in (called <code>apify login</code>).</p>
</td></tr><tr>
<td><code>[options.groups]</code></td><td><code>Array<String></code></td>
</tr>
<tr>
<td colspan="3"><p>Array of Apify Proxy groups to be used.
  If not provided, the proxy will select the groups automatically.</p>
</td></tr><tr>
<td><code>[options.session]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Apify Proxy session identifier to be used by the Chrome browser.
  All HTTP requests going through the proxy with the same session identifier
  will use the same target proxy server (i.e. the same IP address), unless using Residential proxies.
  The identifier can only contain the following characters: <code>0-9</code>, <code>a-z</code>, <code>A-Z</code>, <code>&quot;.&quot;</code>, <code>&quot;_&quot;</code> and <code>&quot;~&quot;</code>.</p>
</td></tr><tr>
<td><code>[options.country]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>If specified, all proxied requests will use IP addresses that are geolocated to the specified country.
For example <code>GB</code> for IPs from Great Britain. Note that online services often have their own rules for handling geolocation and thus
the country selection is a best attempt at geolocation, rather than a guaranteed hit.
This parameter is optional, by default, each proxied request is assigned an IP address from a random country.
The country code needs to be a two letter ISO country code
- see the <a href="https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements" target="_blank">
full list of available country codes
</a>.</p>
<p>This parameter is optional, by default, the proxy uses all available proxy servers from all countries.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.getEnv"></a>

## `Apify.getEnv()` ⇒ [`ApifyEnv`](../typedefs/apifyenv)

Returns a new [`ApifyEnv`](../typedefs/apifyenv) object which contains information parsed from all the `APIFY_XXX` environment variables.

For the list of the `APIFY_XXX` environment variables, see <a href="https://docs.apify.com/actor/run#environment-variables" target="_blank">Actor
documentation</a>. If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.

<a name="module_Apify.getInput"></a>

## `Apify.getInput` ⇒ `Promise<Object>`

Gets the actor input value from the default [`KeyValueStore`](keyvaluestore) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.getValue('INPUT')`](keyvaluestore#KeyValueStore+getValue). For example, calling the following
code:

```javascript
const input = await Apify.getInput();
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.getValue('INPUT');
```

For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore) and
[`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).

**Returns**: `Promise<Object>` - Returns a promise that resolves once the record is stored.  
<a name="module_Apify.getMemoryInfo"></a>

## `Apify.getMemoryInfo()` ⇒ [`Promise<MemoryInfo>`](../typedefs/memoryinfo)

Returns memory statistics of the process and the system, see [`MemoryInfo`](../typedefs/memoryinfo).

If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits, otherwise it gets system memory limits.

Beware that the function is quite inefficient because it spawns a new process. Therefore you shouldn't call it too often, like more than once per
second.

<a name="module_Apify.getValue"></a>

## `Apify.getValue(key)` ⇒ `Promise<Object>`

Gets a value from the default [`KeyValueStore`](keyvaluestore) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue). For example, calling the following code:

```javascript
const value = await Apify.getValue('my-key');
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
const value = await store.getValue('my-key');
```

To store the value to the default-key value store, you can use the [`Apify.setValue()`](#module_Apify.setValue) function.

For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore) and
[`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).

**Returns**: `Promise<Object>` - Returns a promise that resolves once the record is stored.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>key</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Unique record key.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.isAtHome"></a>

## `Apify.isAtHome()` ⇒ `Boolean`

Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).

<a name="module_Apify.launchPuppeteer"></a>

## `Apify.launchPuppeteer([options])` ⇒ `Promise<Browser>`

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
       <a href="https://docs.apify.com/proxy" target="_blank">Apify Proxy</a>
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

To use this function, you need to have the <a href="https://www.npmjs.com/package/puppeteer" target="_blank">puppeteer</a> NPM package installed in
your project. When running on the Apify cloud, you can achieve that simply by using the `apify/actor-node-chrome` base Docker image for your actor -
see <a href="https://docs.apify.com/actor/build#base-images" target="_blank">Apify Actor documentation</a> for details.

For an example of usage, see the [Synchronous run Example](../examples/synchronousrun) or the
[Puppeteer proxy Example](../examples/puppeteerwithproxy)

**Returns**: `Promise<Browser>` - Promise that resolves to Puppeteer's `Browser` instance.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/launchpuppeteeroptions">LaunchPuppeteerOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>Optional settings passed to <code>puppeteer.launch()</code>. In addition to
  <a href="https://pptr.dev/#?product=Puppeteer&show=api-puppeteerlaunchoptions" target="_blank">Puppeteer&#39;s options</a>
  the object may contain our own <a href="../typedefs/launchpuppeteeroptions"><code>LaunchPuppeteerOptions</code></a> that enable additional features.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.main"></a>

## `Apify.main(userFunc)`

Runs the main user function that performs the job of the actor and terminates the process when the user function finishes.

_The `Apify.main()` function is optional_ and is provided merely for your convenience. It is especially useful when you're running your code as an
actor on the [Apify platform](https://apify.com/actors). However, if you want to use Apify SDK tools directly inside your existing projects or outside
of Apify platform, it's probably better to avoid it since it terminates the main process.

The `Apify.main()` function performs the following actions:

<ol>
  <li>When running on the Apify platform (i.e. <code>APIFY_IS_AT_HOME</code> environment variable is set),
  it sets up a connection to listen for platform events.
  For example, to get a notification about an imminent migration to another server.
  See <a href="apify#apifyevents"><code>Apify.events</code></a> for details.
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

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>userFunc</code></td><td><code>function</code></td>
</tr>
<tr>
<td colspan="3"><p>User function to be executed. If it returns a promise,
the promise will be awaited. The user function is called with no arguments.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.metamorph"></a>

## `Apify.metamorph(targetActorId, [input], [options])` ⇒ `Promise<void>`

Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container instead. All the
default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>targetActorId</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Either <code>username/actor-name</code> or actor ID of an actor to which we want to metamorph.</p>
</td></tr><tr>
<td><code>[input]</code></td><td><code>Object</code> | <code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>Input for the actor. If it is an object, it will be stringified to
 JSON and its content type set to <code>application/json; charset=utf-8</code>.
 Otherwise the <code>options.contentType</code> parameter must be provided.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Object with the settings below:</p>
</td></tr><tr>
<td><code>[options.contentType]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Content type for the <code>input</code>. If not specified,
 <code>input</code> is expected to be an object that will be stringified to JSON and content type set to
 <code>application/json; charset=utf-8</code>. If <code>options.contentType</code> is specified, then <code>input</code> must be a
 <code>String</code> or <code>Buffer</code>.</p>
</td></tr><tr>
<td><code>[options.build]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Tag or number of the target actor build to metamorph into (e.g. <code>beta</code> or <code>1.2.345</code>).
 If not provided, the run uses build tag or number from the default actor run configuration (typically <code>latest</code>).</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openDataset"></a>

## `Apify.openDataset([datasetIdOrName], [options])` ⇒ [`Promise<Dataset>`](dataset)

Opens a dataset and returns a promise resolving to an instance of the [`Dataset`](dataset) class.

Datasets are used to store structured data where each object stored has the same attributes, such as online store products or real estate offers. The
actual data is stored either on the local filesystem or in the cloud.

For more details and code examples, see the [`Dataset`](dataset) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[datasetIdOrName]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the dataset to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default dataset associated with the actor run.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.forceCloud]</code></td><td><code>boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code> then the function uses cloud storage usage even if the <code>APIFY_LOCAL_STORAGE_DIR</code>
  environment variable is set. This way it is possible to combine local and cloud storage.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openKeyValueStore"></a>

## `Apify.openKeyValueStore([storeIdOrName], [options])` ⇒ [`Promise<KeyValueStore>`](keyvaluestore)

Opens a key-value store and returns a promise resolving to an instance of the [`KeyValueStore`](keyvaluestore) class.

Key-value stores are used to store records or files, along with their MIME content type. The records are stored and retrieved using a unique key. The
actual data is stored either on a local filesystem or in the Apify cloud.

For more details and code examples, see the [`KeyValueStore`](keyvaluestore) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[storeIdOrName]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the key-value store to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default key-value store associated with the actor run.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.forceCloud]</code></td><td><code>boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code> then the function uses cloud storage usage even if the <code>APIFY_LOCAL_STORAGE_DIR</code>
  environment variable is set. This way it is possible to combine local and cloud storage.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openRequestList"></a>

## `Apify.openRequestList` ⇒ [`Promise<RequestList>`](requestlist)

Opens a request list and returns a promise resolving to an instance of the [`RequestList`](requestlist) class that is already initialized.

[`RequestList`](requestlist) represents a list of URLs to crawl, which is always stored in memory. To enable picking up where left off after a process
restart, the request list sources are persisted to the key value store at initialization of the list. Then, while crawling, a small state object is
regularly persisted to keep track of the crawling status.

For more details and code examples, see the [`RequestList`](requestlist) class.

**Example usage:**

```javascript
const sources = ['https://www.example.com', 'https://www.google.com', 'https://www.bing.com'];

const requestList = await Apify.openRequestList('my-name', sources);
```

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>listName</code></td><td><code>string</code> | <code>null</code></td>
</tr>
<tr>
<td colspan="3"><p>Name of the request list to be opened. Setting a name enables the <code>RequestList</code>&#39;s state to be persisted
  in the key value store. This is useful in case of a restart or migration. Since <code>RequestList</code> is only
  stored in memory, a restart or migration wipes it clean. Setting a name will enable the <code>RequestList</code>&#39;s
  state to survive those situations and continue where it left off.</p>
<p>  The name will be used as a prefix in key value store, producing keys such as <code>NAME-REQUEST_LIST_STATE</code>
  and <code>NAME-REQUEST_LIST_SOURCES</code>.</p>
<p>  If <code>null</code>, the list will not be persisted and will only be stored in memory. Process restart
  will then cause the list to be crawled again from the beginning. We suggest always using a name.</p>
</td></tr><tr>
<td><code>sources</code></td><td><code>Array<(Request|RequestOptions|string)></code></td>
</tr>
<tr>
<td colspan="3"><p>An array of sources of URLs for the <code>RequestList</code>.
 It can be either an array of plain objects that
 define the <code>url</code> property, or an array of instances of the <a href="request"><code>Request</code></a> class.</p>
<p> Additionally, the <code>requestsFromUrl</code> property may be used instead of <code>url</code>,
 which will instruct <code>RequestList</code> to download the source URLs from a given remote location.
 The URLs will be parsed from the received response. In this case you can limit the URLs
using <code>regex</code> parameter containing regular expression pattern for URLs to be included.</p>
<p> For details, see the <a href="requestlist#new_RequestList_new"><code>RequestList</code></a>
 constructor options.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code><a href="../typedefs/requestlistoptions">RequestListOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>The <a href="requestlist#new_RequestList_new"><code>new RequestList</code></a> options. Note that the listName parameter supersedes
  the <code>persistStateKey</code> and <code>persistSourcesKey</code> options and the sources parameter supersedes the <code>sources</code> option.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openRequestQueue"></a>

## `Apify.openRequestQueue` ⇒ [`Promise<RequestQueue>`](requestqueue)

Opens a request queue and returns a promise resolving to an instance of the [`RequestQueue`](requestqueue) class.

[`RequestQueue`](requestqueue) represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud. The queue is used for
deep crawling of websites, where you start with several URLs and then recursively follow links to other pages. The data structure supports both
breadth-first and depth-first crawling orders.

For more details and code examples, see the [`RequestQueue`](requestqueue) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[queueIdOrName]</code></td><td><code>string</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the request queue to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default request queue associated with the actor run.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>object</code></td><td></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.forceCloud]</code></td><td><code>boolean</code></td><td><code>false</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to <code>true</code> then the function uses cloud storage usage even if the <code>APIFY_LOCAL_STORAGE_DIR</code>
  environment variable is set. This way it is possible to combine local and cloud storage.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openSessionPool"></a>

## `Apify.openSessionPool` ⇒ [`Promise<SessionPool>`](sessionpool)

Opens a SessionPool and returns a promise resolving to an instance of the [`SessionPool`](sessionpool) class that is already initialized.

For more details and code examples, see the [`SessionPool`](sessionpool) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>sessionPoolOptions</code></td><td><code><a href="../typedefs/sessionpooloptions">SessionPoolOptions</a></code></td>
</tr>
<tr>
<td colspan="3"><p>The <a href="sessionpool#new_SessionPool_new"><code>new SessionPool</code></a> options</p>
</td></tr></tbody>
</table>
<a name="module_Apify.pushData"></a>

## `Apify.pushData(item)` ⇒ `Promise`

Stores an object or an array of objects to the default [`Dataset`](dataset) of the current actor run.

This is just a convenient shortcut for [`dataset.pushData()`](dataset#Dataset+pushData). For example, calling the following code:

```javascript
await Apify.pushData({ myValue: 123 });
```

is equivalent to:

```javascript
const dataset = await Apify.openDataset();
await dataset.pushData({ myValue: 123 });
```

For more information, see [`Apify.openDataset()`](apify#module_Apify.openDataset) and [`dataset.pushData()`](dataset#Dataset+pushData)

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`, otherwise the actor process might finish before the data are stored!

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>item</code></td><td><code>Object</code> | <code>Array</code></td>
</tr>
<tr>
<td colspan="3"><p>Object or array of objects containing data to be stored in the default dataset.
The objects must be serializable to JSON and the JSON representation of each object must be smaller than 9MB.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.setValue"></a>

## `Apify.setValue(key, value, [options])` ⇒ `Promise`

Stores or deletes a value in the default [`KeyValueStore`](keyvaluestore) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.setValue()`](keyvaluestore#KeyValueStore+setValue). For example, calling the following code:

```javascript
await Apify.setValue('OUTPUT', { foo: 'bar' });
```

is equivalent to:

```javascript
const store = await Apify.openKeyValueStore();
await store.setValue('OUTPUT', { foo: 'bar' });
```

To get a value from the default-key value store, you can use the [`Apify.getValue()`](#module_Apify.getValue) function.

For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore) and
[`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>key</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Unique record key.</p>
</td></tr><tr>
<td><code>value</code></td><td><code>Object</code> | <code>String</code> | <code>Buffer</code></td>
</tr>
<tr>
<td colspan="3"><p>Record data, which can be one of the following values:
  <ul>
    <li>If <code>null</code>, the record in the key-value store is deleted.</li>
    <li>If no <code>options.contentType</code> is specified, <code>value</code> can be any JavaScript object and it will be stringified to JSON.</li>
    <li>If <code>options.contentType</code> is specified, <code>value</code> is considered raw data and it must be a <code>String</code>
    or <a href="https://nodejs.org/api/buffer.html" target="_blank"><code>Buffer</code></a>.</li>
  </ul>
  For any other value an error will be thrown.</p>
</td></tr><tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"></td></tr><tr>
<td><code>[options.contentType]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Specifies a custom MIME content type of the record.</p>
</td></tr></tbody>
</table>

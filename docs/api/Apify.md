---
id: apify
title: Apify
---
<a name="module_Apify"></a>

The following section describes all functions and properties provided by the `apify` package,
except individual classes and namespaces that have their separate, detailed, documentation pages
accessible from the left sidebar.


* [Apify](#module_Apify)
    * [`.call(actId, [input], [options])`](#module_Apify.call) ⇒ [<code>Promise&lt;ActorRun&gt;</code>](../typedefs/actorrun)
    * [`.client`](#module_Apify.client)
    * [`.events`](#module_Apify.events)
    * [`.getApifyProxyUrl(options)`](#module_Apify.getApifyProxyUrl) ⇒ <code>String</code>
    * [`.getEnv()`](#module_Apify.getEnv) ⇒ <code>Object</code>
    * [`.getMemoryInfo()`](#module_Apify.getMemoryInfo) ⇒ <code>Promise&lt;Object&gt;</code>
    * [`.getValue(key)`](#module_Apify.getValue) ⇒ <code>Promise&lt;Object&gt;</code>
    * [`.isAtHome()`](#module_Apify.isAtHome) ⇒ <code>Boolean</code>
    * [`.isDocker()`](#module_Apify.isDocker) ⇒ <code>Promise</code>
    * [`.launchPuppeteer([options])`](#module_Apify.launchPuppeteer) ⇒ <code>Promise&lt;Browser&gt;</code>
    * [`.launchWebDriver([options])`](#module_Apify.launchWebDriver) ⇒ <code>Promise</code>
    * [`.main(userFunc)`](#module_Apify.main)
    * [`.openDataset([datasetIdOrName])`](#module_Apify.openDataset) ⇒ [<code>Promise&lt;Dataset&gt;</code>](dataset)
    * [`.openKeyValueStore([storeIdOrName])`](#module_Apify.openKeyValueStore) ⇒ [<code>Promise&lt;KeyValueStore&gt;</code>](keyvaluestore)
    * [`.openRequestQueue`](#module_Apify.openRequestQueue) ⇒ [<code>Promise&lt;RequestQueue&gt;</code>](requestqueue)
    * [`.pushData(item)`](#module_Apify.pushData) ⇒ <code>Promise</code>
    * [`.setValue(key, value, [options])`](#module_Apify.setValue) ⇒ <code>Promise</code>

<a name="module_Apify.call"></a>

## `Apify.call(actId, [input], [options])` ⇒ [<code>Promise&lt;ActorRun&gt;</code>](../typedefs/actorrun)
Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
waits for the actor to finish and fetches its output.

By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
If the value is less than or equal to zero, the function returns immediately after the run is started.

The result of the function is an [`ActorRun`](../typedefs/actorrun) object
that contains details about the actor run and its output (if any).
If the actor run failed, the function fails with [`ApifyCallError`](../typedefs/apifycallerror) exception.

**Example usage:**

```javascript
const run = await Apify.call('apify/hello-world', { myInput: 123 });
console.log(`Received message: ${run.output.body.message}`);
```

Internally, the `call()` function calls the
<a href="https://www.apify.com/docs/api/v2#/reference/actors/run-collection/run-actor" target="_blank">Run actor</a>
Apify API endpoint and few others to obtain the output.

**Throws**:

- [<code>ApifyCallError</code>](../typedefs/apifycallerror) If the run did not succeed, e.g. if it failed or timed out.

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
<td><code>[options.memory]</code></td><td><code>Number</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Memory in megabytes which will be allocated for the new actor run.
 If not provided, the run uses memory of the default actor run configuration.</p>
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
</td></tr></tbody>
</table>
<a name="module_Apify.client"></a>

## `Apify.client`
Gets the default instance of the `ApifyClient` class provided
<a href="https://www.apify.com/docs/sdk/apify-client-js/latest"
target="_blank">apify-client</a> by the NPM package.
The instance is created automatically by the Apify SDK and it is configured using the
`APIFY_API_BASE_URL`, `APIFY_USER_ID` and `APIFY_TOKEN` environment variables.

The instance is used for all underlying calls to the Apify API in functions such as
[`Apify.getValue()`](#module_Apify.getValue) or [`Apify.call()`](#module_Apify.call).
The settings of the client can be globally altered by calling the
<a href="https://www.apify.com/docs/sdk/apify-client-js/latest#ApifyClient-setOptions"
target="_blank">`Apify.client.setOptions()`</a> function.
Beware that altering these settings might have unintended effects on the entire Apify SDK package.

<a name="module_Apify.events"></a>

## `Apify.events`
Gets an instance of a Node.js'
<a href="https://nodejs.org/api/events.html#events_class_eventemitter" target="_blank">EventEmitter</a>
class that emits various events from the SDK or the Apify platform.
The event emitter is initialized by calling the [`Apify.main()`](#module_Apify.main) function.

**Example usage:**

```javascript
Apify.events.on('cpuInfo', (data) => {
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
                Emitted in regular intervals to notify all components of Apify SDK that it is time to persist
                their state, in order to avoid repeating all work when the actor restarts.
                This event is automatically emitted together with the <code>migrating</code> event,
                in which case the <code>isMigrating</code> flag is set to <code>true</code>. Otherwise the flag is <code>false</code>.
            </td>
        </tr>
    </tbody>
</table>

<a name="module_Apify.getApifyProxyUrl"></a>

## `Apify.getApifyProxyUrl(options)` ⇒ <code>String</code>
Constructs an Apify Proxy URL using the specified settings.
The proxy URL can be used from Apify actors, web browsers or any other HTTP
proxy-enabled applications.

For more information, see
the <a href="https://my.apify.com/proxy" target="_blank">Apify Proxy</a> page in the app
or the <a href="https://www.apify.com/docs/proxy" target="_blank">documentation</a>.

**Returns**: <code>String</code> - Returns the proxy URL, e.g. `http://auto:my_password@proxy.apify.com:8000`.  
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
<td><code>[options.groups]</code></td><td><code>Array&lt;String&gt;</code></td>
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
</td></tr></tbody>
</table>
<a name="module_Apify.getEnv"></a>

## `Apify.getEnv()` ⇒ <code>Object</code>
Returns a new object which contains information parsed from the `APIFY_XXX` environment variables.
It has the following properties:

```javascript
{
    // ID of the actor (APIFY_ACT_ID)
    actId: String,
    // ID of the actor run (APIFY_ACT_RUN_ID)
    actRunId: String,
    // ID of the user who started the actor - note that it might be
    // different than the owner of the actor (APIFY_USER_ID)
    userId: String,
    // Authentication token representing privileges given to the actor run,
    // it can be passed to various Apify APIs (APIFY_TOKEN).
    token: String,
    // Date when the actor was started (APIFY_STARTED_AT)
    startedAt: Date,
    // Date when the actor will time out (APIFY_TIMEOUT_AT)
    timeoutAt: Date,
    // ID of the key-value store where input and output data of this
    // actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
    defaultKeyValueStoreId: String,
    // ID of the dataset where input and output data of this
    // actor is stored (APIFY_DEFAULT_DATASET_ID)
    defaultDatasetId: String,
    // Amount of memory allocated for the actor,
    // in megabytes (APIFY_MEMORY_MBYTES)
    memoryMbytes: Number,
}
```
For the list of the `APIFY_XXX` environment variables, see
<a href="https://www.apify.com/docs/actor#run-env-vars" target="_blank">Actor documentation</a>.
If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.

<a name="module_Apify.getMemoryInfo"></a>

## `Apify.getMemoryInfo()` ⇒ <code>Promise&lt;Object&gt;</code>
Returns memory statistics of the process and the system, which is an object with the following properties:

```javascript
{
  // Total memory available in the system or container
  totalBytes: Number,
  // Amount of free memory in the system or container
  freeBytes: Number,
  // Amount of memory used (= totalBytes - freeBytes)
  usedBytes: Number,
  // Amount of memory used the current Node.js process
  mainProcessBytes: Number,
  // Amount of memory used by child processes of the current Node.js process
  childProcessesBytes: Number,
}
```

If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
otherwise it gets system memory limits.

Beware that the function is quite inefficient because it spawns a new process.
Therefore you shouldn't call it too often, like more than once per second.

<a name="module_Apify.getValue"></a>

## `Apify.getValue(key)` ⇒ <code>Promise&lt;Object&gt;</code>
Gets a value from the default [`KeyValueStore`](keyvaluestore) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).
For example, calling the following code:
```javascript
const input = await Apify.getValue('INPUT');
```

is equivalent to:
```javascript
const store = await Apify.openKeyValueStore();
await store.getValue('INPUT');
```

To store the value to the default-key value store, you can use the [`Apify.setValue()`](#module_Apify.setValue) function.

For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore)
and [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).

**Returns**: <code>Promise&lt;Object&gt;</code> - Returns a promise that resolves once the record is stored.  
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

## `Apify.isAtHome()` ⇒ <code>Boolean</code>
Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).

<a name="module_Apify.isDocker"></a>

## `Apify.isDocker()` ⇒ <code>Promise</code>
Returns a `Promise` that resolves to true if the code is running in a Docker container.

<a name="module_Apify.launchPuppeteer"></a>

## `Apify.launchPuppeteer([options])` ⇒ <code>Promise&lt;Browser&gt;</code>
Launches headless Chrome using Puppeteer pre-configured to work within the Apify platform.
The function has the same argument and the return value as `puppeteer.launch()`.
See <a href="https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions" target="_blank">
Puppeteer documentation</a> for more details.

The `launchPuppeteer()` function alters the following Puppeteer options:

<ul>
   <li>
       Passes the setting from the <code>APIFY_HEADLESS</code> environment variable to the <code>headless</code> option,
       unless it was already defined by the caller or <code>APIFY_XVFB</code> environment variable is set to <code>1</code>.
       Note that Apify Actor cloud platform automatically sets <code>APIFY_HEADLESS=1</code> to all running actors.
   </li>
   <li>
       Takes the <code>proxyUrl</code> option, checks it and adds it to <code>args</code> as <code>--proxy-server=XXX</code>.
       If the proxy uses authentication, the function sets up an anonymous proxy HTTP
       to make the proxy work with headless Chrome. For more information, read the
       <a href="https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212"
       target="_blank">blog post about proxy-chain library</a>.
   </li>
   <li>
       If <code>options.useApifyProxy</code> is <code>true</code> then the function generates a URL of
       <a href="https://www.apify.com/docs/proxy" target="_blank">Apify Proxy</a>
       based on <code>options.apifyProxyGroups</code> and <code>options.apifyProxySession</code> and passes it as <code>options.proxyUrl</code>.
   </li>
   <li>
       The function adds <code>--no-sandbox</code> to <code>args</code> to enable running
       headless Chrome in a Docker container on the Apify platform.
   </li>
</ul>

To use this function, you need to have the <a href="https://www.npmjs.com/package/puppeteer" target="_blank">puppeteer</a>
NPM package installed in your project.
When running on the Apify cloud platform, you can achieve that simply
by using the `apify/actor-node-chrome` base Docker image for your actor - see
<a href="https://www.apify.com/docs/actor#base-images" target="_blank">Apify Actor documentation</a>
for details.

For an example of usage, see the [Synchronous run Example](../examples/synchronousrun) or the [Puppeteer proxy Example](../examples/puppeteerwithproxy)

**Returns**: <code>Promise&lt;Browser&gt;</code> - Promise that resolves to Puppeteer's `Browser` instance.
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
<a name="module_Apify.launchWebDriver"></a>

## `Apify.launchWebDriver([options])` ⇒ <code>Promise</code>
Opens a new instance of Chrome web browser
controlled by <a href="http://www.seleniumhq.org/projects/webdriver/" target="_blank">Selenium WebDriver</a>.
The result of the function is the new instance of the
<a href="http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebDriver.html" target="_blank">
WebDriver</a>
class.

To use this function, you need to have Google Chrome and
<a href="https://sites.google.com/a/chromium.org/chromedriver/" target="_blank">ChromeDriver</a> installed in your environment.
For example, you can use the `apify/actor-node-chrome` base Docker image for your actor - see
<a href="https://www.apify.com/docs/actor#base-images" target="_blank">documentation</a>
for more details.

For an example of usage, see the <a href="https://www.apify.com/apify/example-selenium" target="_blank">apify/example-selenium</a> actor.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[options]</code></td><td><code>Object</code></td>
</tr>
<tr>
<td colspan="3"><p>Optional settings passed to WebDriver. Additionally the object can contain the following fields:</p>
</td></tr><tr>
<td><code>[options.proxyUrl]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>URL to a proxy server. Currently only <code>http://</code> scheme is supported.
Port number must be specified. For example, <code>http://example.com:1234</code>.</p>
</td></tr><tr>
<td><code>[options.headless]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>Indicates that the browser will be started in headless mode.
If the option is not defined, and the <code>APIFY_HEADLESS</code> environment variable has value <code>1</code>
and <code>APIFY_XVFB</code> is NOT <code>1</code>, the value defaults to <code>true</code>, otherwise it will be <code>false</code>.</p>
</td></tr><tr>
<td><code>[options.userAgent]</code></td><td><code>String</code></td>
</tr>
<tr>
<td colspan="3"><p>User-Agent for the browser.
If not provided, the function sets it to a reasonable default.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.main"></a>

## `Apify.main(userFunc)`
Runs the main user function that performs the job of the actor.

`Apify.main()` is especially useful when you're running your code in an actor on the Apify platform.
Note that its use is optional - the function is provided merely for your convenience.

The function performs the following actions:

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
const request = require('request-promise');

Apify.main(() => {
  // My asynchronous function that returns a promise
  return request('http://www.example.com').then((html) => {
    console.log(html);
  });
});
```

To simplify your code, you can take advantage of the `async`/`await` keywords:

```javascript
const request = require('request-promise');

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
<a name="module_Apify.openDataset"></a>

## `Apify.openDataset([datasetIdOrName])` ⇒ [<code>Promise&lt;Dataset&gt;</code>](dataset)
Opens a dataset and returns a promise resolving to an instance of the [`Dataset`](dataset) class.

Datasets are used to store structured data where each object stored has the same attributes,
such as online store products or real estate offers.
The actual data is stored either on the local filesystem or in the cloud.

For more details and code examples, see the [`Dataset`](dataset) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[datasetIdOrName]</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the dataset to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default dataset associated with the actor run.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openKeyValueStore"></a>

## `Apify.openKeyValueStore([storeIdOrName])` ⇒ [<code>Promise&lt;KeyValueStore&gt;</code>](keyvaluestore)
Opens a key-value store and returns a promise resolving to an instance of the [`KeyValueStore`](keyvaluestore) class.

Key-value stores are used to store records or files, along with their MIME content type.
The records are stored and retrieved using a unique key.
The actual data is stored either on a local filesystem or in the Apify cloud.

For more details and code examples, see the [`KeyValueStore`](keyvaluestore) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[storeIdOrName]</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the key-value store to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default key-value store associated with the actor run.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.openRequestQueue"></a>

## `Apify.openRequestQueue` ⇒ [<code>Promise&lt;RequestQueue&gt;</code>](requestqueue)
Opens a request queue and returns a promise resolving to an instance
of the [`RequestQueue`](requestqueue) class.

[`RequestQueue`](requestqueue) represents a queue of URLs to crawl, which is stored either on local filesystem or in the cloud.
The queue is used for deep crawling of websites, where you start with several URLs and then
recursively follow links to other pages. The data structure supports both breadth-first
and depth-first crawling orders.

For more details and code examples, see the [`RequestQueue`](requestqueue) class.

<table>
<thead>
<tr>
<th>Param</th><th>Type</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>[queueIdOrName]</code></td><td><code>string</code></td>
</tr>
<tr>
<td colspan="3"><p>ID or name of the request queue to be opened. If <code>null</code> or <code>undefined</code>,
  the function returns the default request queue associated with the actor run.</p>
</td></tr></tbody>
</table>
<a name="module_Apify.pushData"></a>

## `Apify.pushData(item)` ⇒ <code>Promise</code>
Stores an object or an array of objects to the default [`Dataset`](dataset) of the current actor run.

This is just a convenient shortcut for [`dataset.pushData()`](dataset#Dataset+pushData).
For example, calling the following code:
```javascript
await Apify.pushData({ myValue: 123 });
```

is equivalent to:
```javascript
const dataset = await Apify.openDataset();
await dataset.pushData({ myValue: 123 });
```

For more information, see [`Apify.openDataset()`](apify#module_Apify.openDataset) and [`dataset.pushData()`](dataset#Dataset+pushData)

**IMPORTANT**: Make sure to use the `await` keyword when calling `pushData()`,
otherwise the actor process might finish before the data are stored!

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

## `Apify.setValue(key, value, [options])` ⇒ <code>Promise</code>
Stores or deletes a value in the default [`KeyValueStore`](keyvaluestore) associated with the current actor run.

This is just a convenient shortcut for [`keyValueStore.setValue()`](keyvaluestore#KeyValueStore+setValue).
For example, calling the following code:
```javascript
await Apify.setValue('OUTPUT', { foo: "bar" });
```

is equivalent to:
```javascript
const store = await Apify.openKeyValueStore();
await store.setValue('OUTPUT', { foo: "bar" });
```

To get a value from the default-key value store, you can use the [`Apify.getValue()`](#module_Apify.getValue) function.

For more information, see [`Apify.openKeyValueStore()`](#module_Apify.openKeyValueStore)
and [`keyValueStore.getValue()`](keyvaluestore#KeyValueStore+getValue).

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

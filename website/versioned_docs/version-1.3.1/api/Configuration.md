---
id: version-1.3.1-configuration
title: Configuration
original_id: configuration
---

<a name="configuration"></a>

`Configuration` is a value object holding the SDK configuration. We can use it in two ways:

1. When using `Apify` class, we can get the instance configuration via `sdk.config`

```js
const { Apify } = require('apify');

const sdk = new Apify({ token: '123' });
console.log(sdk.config.get('token')); // '123'
```

2. To get the global configuration (singleton instance). It will respect the environment variables.

```js
console.log(Configuration.getGlobalConfig().get('token')); // returns the token from APIFY_TOKEN env var
```

## Supported Configuration Options

| Key                          | Environment Variable                  | Default Value       |
| ---------------------------- | ------------------------------------- | ------------------- |
| `defaultDatasetId`           | `APIFY_DEFAULT_DATASET_ID`            | `'default'`         |
| `defaultKeyValueStoreId`     | `APIFY_DEFAULT_KEY_VALUE_STORE_ID`    | `'default'`         |
| `defaultRequestQueueId`      | `APIFY_DEFAULT_REQUEST_QUEUE_ID`      | `'default'`         |
| `localStorageDir`            | `APIFY_LOCAL_STORAGE_DIR`             | `'./apify_storage'` |
| `localStorageEnableWalMode`  | `APIFY_LOCAL_STORAGE_ENABLE_WAL_MODE` | `true`              |
| `persistStateIntervalMillis` | `APIFY_PERSIST_STATE_INTERVAL_MILLIS` | `60e3`              |
| `token`                      | `APIFY_TOKEN`                         | -                   |

## Advanced Configuration Options

| Key                         | Environment Variable                 | Default Value              |
| --------------------------- | ------------------------------------ | -------------------------- |
| `actorEventsWsUrl`          | `APIFY_ACTOR_EVENTS_WS_URL`          | -                          |
| `actorId`                   | `APIFY_ACTOR_ID`                     | -                          |
| `actorRunId`                | `APIFY_ACTOR_RUN_ID`                 | -                          |
| `actorTaskId`               | `APIFY_ACTOR_TASK_ID`                | -                          |
| `apiBaseUrl`                | `APIFY_API_BASE_URL`                 | `'https://api.apify.com'`  |
| `containerPort`             | `APIFY_CONTAINER_PORT`               | `4321`                     |
| `containerUrl`              | `APIFY_CONTAINER_URL`                | `'http://localhost:4321'`  |
| `inputKey`                  | `APIFY_INPUT_KEY`                    | `'INPUT'`                  |
| `isAtHome`                  | `APIFY_IS_AT_HOME`                   | -                          |
| `metamorphAfterSleepMillis` | `APIFY_METAMORPH_AFTER_SLEEP_MILLIS` | `300e3`                    |
| `proxyHostname`             | `APIFY_PROXY_HOSTNAME`               | `'proxy.apify.com'`        |
| `proxyPassword`             | `APIFY_PROXY_PASSWORD`               | -                          |
| `proxyPort`                 | `APIFY_PROXY_PORT`                   | `8000`                     |
| `proxyStatusUrl`            | `APIFY_PROXY_STATUS_URL`             | `'http://proxy.apify.com'` |
| `userId`                    | `APIFY_USER_ID`                      | -                          |

## Not Supported environment variables

-   `MEMORY_MBYTES`
-   `HEADLESS`
-   `XVFB`
-   `CHROME_EXECUTABLE_PATH`

---

<a name="exports.configuration"></a>

## `new Configuration(options)`

Creates new `Configuration` instance with provided options. Env vars will have precedence over those.

**Parameters**:

-   **`options`**: `Record<string, (number|string|boolean)>`

---

<a name="get"></a>

## `configuration.get(key, [defaultValue])`

Returns configured value. First checks the environment variables, then provided configuration, fallbacks to the `defaultValue` argument if provided,
otherwise uses the default value as described in the above section.

**Parameters**:

-   **`key`**: `string`
-   **`[defaultValue]`**: `string` | `number` | `boolean`

**Returns**:

`string` \| `number` \| `boolean`

---

<a name="set"></a>

## `configuration.set(key, [value])`

Sets value for given option. Only affects this `Configuration` instance, the value will not be propagated down to the env var. To reset a value, we
can omit the `value` argument or pass `undefined` there.

**Parameters**:

-   **`key`**: `string`
-   **`[value]`**: `string` | `number` | `boolean`

---

<a name="getclient"></a>

## `configuration.getClient([options])`

Returns cached instance of [`ApifyClient`](../api/apify) using options as defined in the environment variables or in this
[`Configuration`](../api/configuration) instance. Only first call of this method will create the client, following calls will return the same client
instance.

Caching works based on the API URL and token, so calling this method with different options will return multiple instances, one for each variant of
the options.

**Internal**:  
**Parameters**:

-   **`[options]`**: `object`
    -   **`[token]`**: `string`
    -   **`[maxRetries]`**: `string`
    -   **`[minDelayBetweenRetriesMillis]`**: `string`

**Returns**:

[`ApifyClient`](../api/apify)

---

<a name="getstoragelocal"></a>

## `configuration.getStorageLocal([options])`

Returns cached instance of [`ApifyStorageLocal`](../api/apify) using options as defined in the environment variables or in this
[`Configuration`](../api/configuration) instance. Only first call of this method will create the client, following calls will return the same client
instance.

Caching works based on the `storageDir` option, so calling this method with different `storageDir` will return multiple instances, one for each
directory.

**Internal**:  
**Parameters**:

-   **`[options]`**: `object`
    -   **`[storageDir]`**: `string`
    -   **`[enableWalMode]`**: `boolean` <code> = true</code>

**Returns**:

[`ApifyStorageLocal`](../api/apify)

---

<a name="createclient"></a>

## `configuration.createClient([options])`

Creates an instance of ApifyClient using options as defined in the environment variables or in this `Configuration` instance.

**Internal**:  
**Parameters**:

-   **`[options]`**: `object`
    -   **`[token]`**: `string`
    -   **`[maxRetries]`**: `string`
    -   **`[minDelayBetweenRetriesMillis]`**: `string`

**Returns**:

[`ApifyClient`](../api/apify)

---

<a name="createstoragelocal"></a>

## `configuration.createStorageLocal([options])`

Creates an instance of ApifyStorageLocal using options as defined in the environment variables or in this `Configuration` instance.

**Internal**:  
**Parameters**:

-   **`[options]`**: `object`
    -   **`[storageDir]`**: `string`
    -   **`[enableWalMode]`**: `boolean` <code> = true</code>

**Returns**:

[`ApifyStorageLocal`](../api/apify)

---

<a name="getglobalconfig"></a>

## `Configuration.getGlobalConfig()`

Returns the global configuration instance. It will respect the environment variables. As opposed to this method, we can also get the SDK instance
configuration via `sdk.config` property.

**Returns**:

[`Configuration`](../api/configuration)

---

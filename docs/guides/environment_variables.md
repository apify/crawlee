---
id: environment-variables
title: Environment Variables
---

The following is a list of the environment variables used by Apify SDK that are available to the user.
The SDK is capable of running without any env vars present, but certain features will only become available
after env vars are properly set. You can use [Apify CLI](https://github.com/apify/apify-cli)
to set the env vars for you. [Apify platform](../guides/apify-platform) also sets the variables automatically.

## Important env vars:
The following environment variables have large impact on the way Apify SDK works and its behavior
can be changed significantly by setting or unsetting them.

### `APIFY_LOCAL_STORAGE_DIR`
Defines the path to a local directory where [`KeyValueStore`](../api/key-value-store),
[`Dataset`](../api/dataset), and [`RequestQueue`](../api/request-queue) store their data.
Typically it is set to `./apify_storage`. If omitted, you should define the [`APIFY_TOKEN`](#apify_token)
environment variable instead.

### `APIFY_TOKEN`
The API token for your Apify account. It is used to access the Apify API, e.g. to access cloud storage
or to run an actor on the Apify platform. You can find your API token on the
[Account - Integrations](https://console.apify.com/account#/integrations) page. If omitted,
you should define the `APIFY_LOCAL_STORAGE_DIR` environment variable instead.

### Combinations of `APIFY_LOCAL_STORAGE_DIR` and `APIFY_TOKEN`
By combining the env vars in various ways, you can greatly influence the behavior of Apify SDK.

| Env Vars                                    | API | Storages       |
| ------------------------------------------- | --- | -------------- |
|  none OR `APIFY_LOCAL_STORAGE_DIR`          | no  | local          |
| `APIFY_TOKEN`                               | yes | Apify platform |
| `APIFY_TOKEN` AND `APIFY_LOCAL_STORAGE_DIR` | yes | local+platform |

When using both `APIFY_TOKEN` and `APIFY_LOCAL_STORAGE_DIR`, you can use all the Apify platform
features and your data will be stored locally by default. If you want to access platform storages,
you can use the `{ forceCloud: true }` option in their respective functions.

```js
const localDataset = await Apify.openDataset('my-local-data');
const remoteDataset = await Apify.openDataset('my-remote-data', { forceCloud: true });
```

## Convenience env vars:
The next group includes env vars that can help achieve certain goals without having to change
your code, such as temporarily switching log level to DEBUG.

### `APIFY_HEADLESS`
If set to `1`, web browsers launched by Apify SDK will run in the headless mode. You can still override
this setting in the code, e.g. by passing the `headless: true` option to the
[`Apify.launchPuppeteer()`](../api/apify#launchpuppeteer) function. But having this setting
in an environment variable allows you to develop the crawler locally in headful mode to simplify the debugging,
and only run the crawler in headless mode once you deploy it to the Apify platform. By default, the browsers
are launched in headful mode, i.e. with windows.

### `APIFY_LOG_LEVEL`
Specifies the minimum log level, which can be one of the following values (in order of severity):
`DEBUG`, `INFO`, `WARNING` and `ERROR`. By default, the log level is set to `INFO`,
which means that `DEBUG` messages are not printed to console. See the [`utils.log`](../api/log)
namespace for logging utilities.

### `APIFY_MEMORY_MBYTES`
Sets the amount of system memory in megabytes to be used by the [`AutoscaledPool`](../api/autoscaled-pool).
It is used to limit the number of concurrently running tasks. By default, the max amount of memory
to be used is set to one quarter of total system memory, i. e. on a system with 8192 MB of memory,
the autoscaling feature will only use up to 2048 MB of memory.

### `APIFY_PROXY_PASSWORD`
Optional password to [Apify Proxy](https://docs.apify.com/proxy) for IP address rotation.
If you have an Apify Account, you can find the password on the [Proxy page](https://console.apify.com/proxy)
in the Apify app. The password is automatically inferred using the `APIFY_TOKEN` env var,
so in most cases, you don't need to touch it. You should use it when, for some reason,
you need access to Apify Proxy, but no access to Apify API, or when you need access to
proxy from a different account than your token represents.

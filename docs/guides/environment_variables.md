---
id: environment-variables
title: Environment Variables
---

The following is a list of the environment variables used by Apify SDK that are available to the user:

## `APIFY_HEADLESS`
If set to `1`, web browsers launched by Apify SDK will run in the headless mode. You can still override
this setting in the code, e.g. by passing the `headless: true` option to the
[`Apify.launchPuppeteer()`](/docs/api/apify#launchpuppeteer) function. But having this setting
in an environment variable allows you to develop the crawler locally in headful mode to simplify the debugging,
and only run the crawler in headless mode once you deploy it to the Apify Cloud. By default, the browsers
are launched in headful mode, i.e. with windows.

## `APIFY_LOCAL_STORAGE_DIR`
Defines the path to a local directory where [`KeyValueStore`](/docs/api/key-value-store),
[`Dataset`](/docs/api/dataset), and [`RequestQueue`](/docs/api/request-queue) store their data.
Typically it is set to `./apify_storage`. If omitted, you should define the [`APIFY_TOKEN`](#apify_token)
environment variable instead.

## `APIFY_LOG_LEVEL`
Specifies the minimum log level, which can be one of the following values (in order of severity):
`DEBUG`, `INFO`, `WARNING` and `ERROR`. By default, the log level is set to `INFO`,
which means that `DEBUG` messages are not printed to console. See the [`utils.log`](/docs/api/log)
namespace for logging utilities.

## `APIFY_MEMORY_MBYTES`
Sets the amount of system memory in megabytes to be used by the [`AutoscaledPool`](/docs/api/autoscaled-pool).
It is used to limit the number of concurrently running tasks. By default, the max amount of memory
to be used is set to one quarter of total system memory, i. e. on a system with 8192 MB of memory,
the autoscaling feature will only use up to 2048 MB of memory.

## `APIFY_PROXY_PASSWORD`
Optional password to [Apify Proxy](https://docs.apify.com/proxy) for IP address rotation.
If you have have an Apify Account, you can find the password on the [Proxy page](https://my.apify.com/proxy)
in the Apify app. This feature is optional. You can use your own proxies or no proxies at all.

## `APIFY_TOKEN`
The API token for your Apify Account. It is used to access the Apify API, e.g. to access cloud storage
or to run an actor in the Apify Cloud. You can find your API token on the
[Account - Integrations](https://my.apify.com/account#/integrations) page. If omitted,
you should define the `APIFY_LOCAL_STORAGE_DIR` environment variable instead.

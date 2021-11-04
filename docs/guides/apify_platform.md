---
id: apify-platform
title: Apify Platform
---

Apify is a [platform](https://apify.com) built to serve large-scale and high-performance web scraping
and automation needs. It provides easy access to [compute instances (Actors)](#what-is-an-actor),
convenient [request](../guides/request-storage) and [result](../guides/result-storage) storages, [proxies](../guides/proxy-management),
[scheduling](https://docs.apify.com/scheduler), [webhooks](https://docs.apify.com/webhooks)
and [more](https://docs.apify.com/), accessible through a [web interface](https://console.apify.com)
or an [API](https://docs.apify.com/api).

While we think that the Apify platform is super cool, and you should definitely sign up for a
[free account](https://console.apify.com/sign-up), **Apify SDK is and will always be open source**,
runnable locally or on any cloud infrastructure.

> Note that we do not test Apify SDK in other cloud environments such as Lambda or on specific
> architectures such as Raspberry PI. We strive to make it work, but there are no guarantees.

## Logging into Apify platform from Apify SDK
To access your [Apify account](https://console.apify.com/sign-up) from the SDK, you must provide
credentials - [your API token](https://console.apify.com/account#/integrations). You can do that
either by utilizing [Apify CLI](https://github.com/apify/apify-cli) or with environment
variables.

Once you provide credentials to your scraper, you will be able to use all the Apify platform
features of the SDK, such as calling actors, saving to cloud storages, using Apify proxies,
setting up webhooks and so on.

### Log in with CLI
Apify CLI allows you to log in to your Apify account on your computer. If you then run your
scraper using the CLI, your credentials will automatically be added.

```
npm install -g apify-cli
```
```
apify login -t YOUR_API_TOKEN
```
In your project folder:
```
apify run -p
```

### Log in with environment variables
If you prefer not to use Apify CLI, you can always provide credentials to your scraper
by setting the [`APIFY_TOKEN`](../guides/environment-variables#apify_token) environment
variable to your API token.

> There's also the [`APIFY_PROXY_PASSWORD`](../guides/environment-variables#apify_proxy_password)
> environment variable. It is automatically inferred from your token by the SDK, but it can be useful
> when you need to access proxies from a different account than your token represents.

## What is an actor
When you deploy your script to the Apify platform, it becomes an [actor](https://apify.com/actors).
An actor is a serverless microservice that accepts an input and produces an output. It can run for
a few seconds, hours or even infinitely. An actor can perform anything from a simple action such
as filling out a web form or sending an email, to complex operations such as crawling an entire website
and removing duplicates from a large dataset.

Actors can be shared in the [Apify Store](https://apify.com/store) so that other people can use them.
But don't worry, if you share your actor in the store and somebody uses it, it runs under their account,
not yours.

**Related links**

-   [Store of existing actors](https://apify.com/store)
-   [Documentation](https://docs.apify.com/actor)
-   [View actors in Apify Console](https://console.apify.com/actors)
-   [API reference](https://apify.com/docs/api/v2#/reference/actors)

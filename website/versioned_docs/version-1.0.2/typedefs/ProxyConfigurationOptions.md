---
id: version-1.0.2-proxy-configuration-options
title: ProxyConfigurationOptions
original_id: proxy-configuration-options
---

<a name="proxyconfigurationoptions"></a>

## Properties

### `password`

**Type**: `string`

User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable, which is automatically set by the system
when running the actors.

---

### `groups`

**Type**: `Array<string>`

An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy). If not provided, the proxy will select the groups
automatically.

---

### `countryCode`

**Type**: `string`

If set and relevant proxies are available in your Apify account, all proxied requests will use IP addresses that are geolocated to the specified
country. For example `GB` for IPs from Great Britain. Note that online services often have their own rules for handling geolocation and thus the
country selection is a best attempt at geolocation, rather than a guaranteed hit. This parameter is optional, by default, each proxied request is
assigned an IP address from a random country. The country code needs to be a two letter ISO country code. See the
[full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements). This parameter is
optional, by default, the proxy uses all available proxy servers from all countries. on the Apify cloud, or when using the
[Apify CLI](https://github.com/apify/apify-cli).

---

### `apifyProxyGroups`

**Type**: `Array<string>`

Same option as `groups` which can be used to configurate the proxy by UI input schema. You should use the `groups` option in your crawler code.

---

### `apifyProxyCountry`

**Type**: `string`

Same option as `countryCode` which can be used to configurate the proxy by UI input schema. You should use the `countryCode` option in your crawler
code.

---

### `proxyUrls`

**Type**: `Array<string>`

An array of custom proxy URLs to be rotated. Custom proxies are not compatible with Apify Proxy and an attempt to use both configuration options will
cause an error to be thrown on initialize.

---

### `newUrlFunction`

**Type**: [`ProxyConfigurationFunction`](../typedefs/proxy-configuration-function)

Custom function that allows you to generate the new proxy URL dynamically. It gets the `sessionId` as a parameter and should always return stringified
proxy URL. This function is used to generate the URL when [`ProxyConfiguration.newUrl`](../api/proxy-configuration#newurl) or
[`ProxyConfiguration.newProxyInfo`](../api/proxy-configuration#newproxyinfo) is called.

---

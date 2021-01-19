---
id: version-0.22.4-proxy-configuration
title: ProxyConfiguration
original_id: proxy-configuration
---

<a name="proxyconfiguration"></a>

Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking your crawlers based
on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures them to use the selected proxies for
all connections. You can get information about the currently used proxy by inspecting the [`ProxyInfo`](../typedefs/proxy-info) property in your
crawler's page function. There, you can inspect the proxy's URL and other attributes.

The proxy servers are managed by [Apify Proxy](https://docs.apify.com/proxy). To be able to use Apify Proxy, you need an Apify account and access to
the selected proxies. If you provide no configuration option, the proxies will be managed automatically using a smart algorithm.

If you want to use your own proxies, use the [`ProxyConfigurationOptions.proxyUrls`](../typedefs/proxy-configuration-options#proxyurls) option. Your
list of proxy URLs will be rotated by the configuration if this option is provided.

**Example usage:**

```javascript

const proxyConfiguration = await Apify.createProxyConfiguration({
  groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
  countryCode: 'US',
});

const crawler = new Apify.CheerioCrawler({
  // ...
  proxyConfiguration,
  handlePageFunction: ({ proxyInfo }) => {
     const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
  }
})

```

---

<a name="initialize"></a>

## `proxyConfiguration.initialize()`

Loads proxy password if token is provided and checks access to Apify Proxy and provided proxy groups if Apify Proxy configuration is used. Also checks
if country has access to Apify Proxy groups if the country code is provided.

You should use the [`Apify.createProxyConfiguration`](../api/apify#createproxyconfiguration) function to create a pre-initialized `ProxyConfiguration`
instance instead of calling this manually.

**Returns**:

`Promise<void>`

---

<a name="newproxyinfo"></a>

## `proxyConfiguration.newProxyInfo([sessionId])`

This function creates a new [`ProxyInfo`](../typedefs/proxy-info) info object. It is used by CheerioCrawler and PuppeteerCrawler to generate proxy
URLs and also to allow the user to inspect the currently used proxy via the handlePageFunction parameter: proxyInfo. Use it if you want to work with a
rich representation of a proxy URL. If you need the URL string only, use [`ProxyConfiguration.newUrl`](../api/proxy-configuration#newurl).

**Parameters**:

-   **`[sessionId]`**: `string` | `number` - Represents the identifier of user [`Session`](../api/session) that can be managed by the
    [`SessionPool`](../api/session-pool) or you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier. When the provided
    sessionId is a number, it's converted to a string. Property sessionId of [`ProxyInfo`](../typedefs/proxy-info) is always returned as a type
    string.

All the HTTP requests going through the proxy with the same session identifier will use the same target proxy server (i.e. the same IP address). The
identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.

**Returns**:

[`ProxyInfo`](../typedefs/proxy-info) - represents information about used proxy and its configuration.

---

<a name="newurl"></a>

## `proxyConfiguration.newUrl([sessionId])`

Returns a new proxy URL based on provided configuration options and the `sessionId` parameter.

**Parameters**:

-   **`[sessionId]`**: `string` | `number` - Represents the identifier of user [`Session`](../api/session) that can be managed by the
    [`SessionPool`](../api/session-pool) or you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier. When the provided
    sessionId is a number, it's converted to a string.

All the HTTP requests going through the proxy with the same session identifier will use the same target proxy server (i.e. the same IP address). The
identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.

**Returns**:

`string` - represents the proxy URL.

---

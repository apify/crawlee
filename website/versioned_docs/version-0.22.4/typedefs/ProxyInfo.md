---
id: version-0.22.4-proxy-info
title: ProxyInfo
original_id: proxy-info
---

<a name="proxyinfo"></a>

The main purpose of the ProxyInfo object is to provide information about the current proxy connection used by the crawler for the request. Outside of
crawlers, you can get this object by calling [`ProxyConfiguration.newProxyInfo`](../api/proxy-configuration#newproxyinfo).

**Example usage:**

```javascript

const proxyConfiguration = await Apify.createProxyConfiguration({
  groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
  countryCode: 'US',
});

// Getting proxyInfo object by calling class method directly
const proxyInfo = proxyConfiguration.newProxyInfo();

// In crawler
const crawler = new Apify.CheerioCrawler({
  // ...
  proxyConfiguration,
  handlePageFunction: ({ proxyInfo }) => {
     // Getting used proxy URL
      const proxyUrl = proxyInfo.url;

     // Getting ID of used Session
      const sessionIdentifier = proxyInfo.sessionId;
  }
})

```

## Properties

### `sessionId`

**Type**: `string`

The identifier of used [`Session`](../api/session), if used.

---

### `url`

**Type**: `string`

The URL of the proxy.

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
optional, by default, the proxy uses all available proxy servers from all countries.

---

### `password`

**Type**: `string`

User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD` environment variable, which is automatically set by the system
when running the actors on the Apify cloud, or when using the [Apify CLI](https://github.com/apify/apify-cli).

---

### `hostname`

**Type**: `string`

Hostname of your proxy.

---

### `port`

**Type**: `string`

Proxy port.

---

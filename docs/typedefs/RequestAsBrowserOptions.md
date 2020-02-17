---
id: requestasbrowseroptions
title: RequestAsBrowserOptions
---

<a name="RequestAsBrowserOptions"></a>

**Properties**

<table>
<thead>
<tr>
<th>Param</th><th>Type</th><th>Default</th>
</tr>
</thead>
<tbody>
<tr>
<td><code>url</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>URL of the target endpoint. Supports both HTTP and HTTPS schemes.</p>
</td></tr><tr>
<td><code>[method]</code></td><td><code>String</code></td><td><code>GET</code></td>
</tr>
<tr>
<td colspan="3"><p>HTTP method.</p>
</td></tr><tr>
<td><code>[headers]</code></td><td><code>Object</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Additional HTTP headers to add. It&#39;s only recommended to use this option,
 with headers that are typically added by websites, such as cookies. Overriding
 default browser headers will remove the masking this function provides.</p>
</td></tr><tr>
<td><code>[proxyUrl]</code></td><td><code>String</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>An HTTP proxy to be passed down to the HTTP request. Supports proxy authentication with Basic Auth.</p>
</td></tr><tr>
<td><code>[languageCode]</code></td><td><code>String</code></td><td><code>en</code></td>
</tr>
<tr>
<td colspan="3"><p>Two-letter ISO 639 language code.</p>
</td></tr><tr>
<td><code>[countryCode]</code></td><td><code>String</code></td><td><code>US</code></td>
</tr>
<tr>
<td colspan="3"><p>Two-letter ISO 3166 country code.</p>
</td></tr><tr>
<td><code>[useMobileVersion]</code></td><td><code>Boolean</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>If <code>true</code>, the function uses User-Agent of a mobile browser.</p>
</td></tr><tr>
<td><code>[abortFunction]</code></td><td><code>function</code></td><td></td>
</tr>
<tr>
<td colspan="3"><p>Function accepts <code>response</code> object as a single parameter and should return true or false.
 If function returns true request gets aborted. This function is passed to the
 (@apify/http-request)[<a href="https://www.npmjs.com/package/@apify/http-request%5D">https://www.npmjs.com/package/@apify/http-request]</a> NPM package.</p>
</td></tr><tr>
<td><code>[ignoreSslErrors]</code></td><td><code>boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>If set to true, SSL/TLS certificate errors will be ignored.</p>
</td></tr><tr>
<td><code>[useInsecureHttpParser]</code></td><td><code>boolean</code></td><td><code>true</code></td>
</tr>
<tr>
<td colspan="3"><p>Node.js HTTP parser is stricter than Browser parsers. This prevents fetching of some websites
 whose servers do not comply with HTTP specs or employ anti-scraping protections due to
 various parse errors, typically <code>invalid header value char</code> error. This option forces
 the parser to ignore certain errors which allows those websites to be scraped.
 However, it will also open your application to various security vulnerabilities.</p>
</td></tr></tbody>
</table>
